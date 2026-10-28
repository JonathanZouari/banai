"""Voice for the AI designer: speech-to-text in, text-to-speech out. A chained pipeline: the
transcript goes through the normal /api/chat turn, so voice never bypasses the signed proposal
and its Confirm step. The server stores nothing.

Off by default (VOICE_ENABLED). Spend guards: a clip size cap, a per-IP rate limit, an hourly
cap and an in-memory daily budget (it resets on restart; the OpenAI dashboard budget is the backstop).
"""

from __future__ import annotations

import logging
import re
import time
from collections import deque
from threading import Lock
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from app.agent.language import Language
from app.api.agent import MESSAGE_TEXT_PATTERN, get_llm_client, localized, provider_error
from app.api.limits import limiter
from app.config import Settings, get_settings, get_signing_key
from app.services import signing

router = APIRouter(prefix="/api/voice")
log = logging.getLogger(__name__)

# ASSUMPTION: configurable defaults (OPENAI_TRANSCRIBE_MODEL / OPENAI_TTS_MODEL / OPENAI_TTS_VOICE).
DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe"
DEFAULT_TTS_MODEL = "gpt-4o-mini-tts"
DEFAULT_TTS_VOICE = "marin"

MAX_TRANSCRIPT_CHARS = 2000  # the chat message limit
MAX_SPEECH_CHARS = 1000
MIN_AUDIO_BYTES = 800  # shorter than this is a tap, not speech
AUDIO_TYPES = {
    "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
}
# Measured on real Hebrew audio (2026-10-16): English instructions that name Hebrew speak it most
# clearly; instructions written in Hebrew made the speech worse.
SPEECH_STYLE = (
    "Speak in the language of the text. For Hebrew, use fluent native Israeli Hebrew pronunciation. "
    "Calm, friendly furniture designer; clear and concise."
)
# Domain vocabulary in both languages: fixes Hebrew misrecognitions and writes sizes as digits,
# without forcing a language (English speech stays English).
TRANSCRIBE_PROMPT = (
    "שיחה על עיצוב ארון בגדים, בעברית או באנגלית: ארון, תא, מדף, מגירה, מוט תלייה, מחיצה, "
    "דלתות הזזה, דלתות ציר, רוחב, גובה, עומק, סנטימטר, מט, מבריק. "
    "Wardrobe design in Hebrew or English: shelf, drawer, hanging rail, sliding doors, width, cm."
)
PROMPTABLE_MODELS = {"gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"}
# Abbreviations TTS reads letter by letter; spoken as words instead.
SPOKEN_UNITS = {'ס"מ': "סנטימטר", "ס״מ": "סנטימטר", 'מ"מ': "מילימטר", "מ״מ": "מילימטר"}

# Conservative cost estimates for the in-app budget guard (not accounting).
STT_USD_PER_MIN = 0.006
TTS_USD_PER_MIN = 0.015
# Low on purpose: the byte cap is not a duration cap (a very low bitrate file can hold minutes of audio), so
# charge as if the audio were long. Normal browser speech is 4000+ B/s, so real clips are overcharged about 4x.
ASSUMED_BYTES_PER_SECOND = 1000
MAX_CHARGED_SECONDS = 600
SPOKEN_CHARS_PER_SECOND = 14
PCM_FORMAT = "pcm16;rate=24000;channels=1"  # raw 16-bit little-endian mono, so playback can start at the first bytes

VOICE_MESSAGES: dict[str, dict[str, str]] = {
    "VOICE_DISABLED": {"he": "הקול לא מופעל בשרת הזה.", "en": "Voice is not enabled on this server."},
    "VOICE_BUSY": {"he": "הקול עמוס כרגע. נסה שוב מאוחר יותר.", "en": "Voice is busy right now. Please try again later."},
    "VOICE_BUDGET": {"he": "הקול מושהה להיום. אפשר להמשיך להקליד.", "en": "Voice is paused for today. You can keep typing."},
}

_lock = Lock()
_recent: deque[float] = deque()
_spend: deque[tuple[float, float]] = deque()


def _voice_error(status: int, code: str, language: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": False, "error": {"code": code, "message": VOICE_MESSAGES[code][language]}})


def _prune(now: float) -> None:
    while _recent and now - _recent[0] > 3600:
        _recent.popleft()
    while _spend and now - _spend[0][0] > 86400:
        _spend.popleft()


def reserve(settings: Settings, estimated_usd: float) -> str | None:
    """Count this request against the hourly cap and daily budget; returns the refusal code, if any."""
    now = time.monotonic()
    with _lock:
        _prune(now)
        if len(_recent) >= settings.voice_hourly_cap:
            return "VOICE_BUSY"
        if sum(usd for _, usd in _spend) + estimated_usd > settings.voice_daily_budget_usd:
            return "VOICE_BUDGET"
        _recent.append(now)
        _spend.append((now, estimated_usd))
        return None


def reset_guards() -> None:
    with _lock:
        _recent.clear()
        _spend.clear()


def spoken(text: str) -> str:
    for short, word in SPOKEN_UNITS.items():
        text = text.replace(short, word)
    return text


def _model(value: str, default: str) -> str:
    return value.strip() or default


def _normalized(text: str) -> str:
    return " ".join(text.split())


def sniff_audio(data: bytes) -> str | None:
    """Container type from magic bytes (the Content-Type header alone is not trusted)."""
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    if data[:4] == b"OggS":
        return "ogg"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[4:8] == b"ftyp":
        return "mp4"
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return "mp3"
    return None


async def _read_capped(request: Request, limit: int) -> bytes | None:
    """The body, or None once it passes `limit` bytes (stops reading early)."""
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/status")
def status(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    enabled = settings.voice_enabled and settings.agent_enabled
    return {"success": True, "data": {"enabled": enabled, "maxSeconds": settings.voice_max_seconds}}


@router.post("/transcribe")
@limiter.limit(lambda: get_settings().voice_rate_limit)
async def transcribe(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[Any, Depends(get_llm_client)],
    language: Annotated[Language, Query()] = "he",
):
    if client is None:
        return localized(503, "AGENT_UNAVAILABLE", language)
    if not settings.voice_enabled:
        return _voice_error(503, "VOICE_DISABLED", language)
    media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if media_type not in AUDIO_TYPES:
        return localized(415, "UNSUPPORTED_AUDIO", language)
    audio = await _read_capped(request, settings.voice_max_audio_bytes)
    if audio is None:
        return localized(413, "AUDIO_TOO_LARGE", language)
    if len(audio) < MIN_AUDIO_BYTES:
        return localized(422, "NO_SPEECH", language)
    kind = sniff_audio(audio)
    if kind is None:
        return localized(415, "UNSUPPORTED_AUDIO", language)
    seconds = min(len(audio) / ASSUMED_BYTES_PER_SECOND, MAX_CHARGED_SECONDS)
    if refused := reserve(settings, seconds / 60 * STT_USD_PER_MIN):
        return _voice_error(429, refused, language)
    # No language hint: the customer may speak either language, and the chat switches to whichever
    # the transcript is written in. `language` only localizes the error messages.
    model = _model(settings.openai_transcribe_model, DEFAULT_TRANSCRIBE_MODEL)
    try:
        # The OpenAI client is synchronous: run it off the event loop, or one slow upstream call
        # would stall every other request (health checks included).
        result = await run_in_threadpool(
            client.audio.transcriptions.create,
            model=model,
            file=(f"speech.{kind}", audio, f"audio/{kind}"),
            **({"prompt": TRANSCRIBE_PROMPT} if model in PROMPTABLE_MODELS else {}),
        )
    except Exception as exc:  # never echo upstream error text to the customer
        log.warning("transcription failed: %s", type(exc).__name__)
        return provider_error(exc, language)
    text = " ".join((getattr(result, "text", "") or "").split())[:MAX_TRANSCRIPT_CHARS]
    if not text or not re.fullmatch(MESSAGE_TEXT_PATTERN, text):  # must be sendable as a chat message
        return localized(422, "NO_SPEECH", language)
    return {"success": True, "data": {"text": text}}


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, Field(min_length=1, max_length=MAX_SPEECH_CHARS, pattern=MESSAGE_TEXT_PATTERN)]
    language: Language = "he"
    signature: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]  # replySignature from /api/chat
    # One piece of `text` to speak now (the client splits long replies, see voice/speechPlan.js).
    piece: Annotated[str | None, Field(min_length=1, max_length=MAX_SPEECH_CHARS, pattern=MESSAGE_TEXT_PATTERN)] = None


@router.post("/speech")
@limiter.limit(lambda: get_settings().voice_rate_limit)
async def speech(
    request: Request,
    body: SpeechRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[Any, Depends(get_llm_client)],
):
    """Streams one spoken piece of a signed agent reply as raw PCM, so playback starts at the first bytes."""
    if client is None:
        return localized(503, "AGENT_UNAVAILABLE", body.language)
    if not settings.voice_enabled:
        return _voice_error(503, "VOICE_DISABLED", body.language)
    # Only the agent's own replies are spoken: this is not an open text-to-speech proxy.
    if not signing.verify_reply(get_signing_key(), body.signature, body.text):
        return localized(403, "BAD_REPLY_SIGNATURE", body.language)
    text = _normalized(body.piece if body.piece is not None else body.text)
    if not text or text not in _normalized(body.text) or len(text) > settings.voice_tts_max_chars:
        return localized(403, "BAD_REPLY_SIGNATURE", body.language)
    if refused := reserve(settings, len(text) / SPOKEN_CHARS_PER_SECOND / 60 * TTS_USD_PER_MIN):
        return _voice_error(429, refused, body.language)

    def open_stream():
        manager = client.audio.speech.with_streaming_response.create(
            model=_model(settings.openai_tts_model, DEFAULT_TTS_MODEL),
            voice=_model(settings.openai_tts_voice, DEFAULT_TTS_VOICE),
            input=spoken(text), instructions=SPEECH_STYLE, response_format="pcm",
        )
        response = manager.__enter__()
        chunks = response.iter_bytes(4096)
        try:
            first = next(chunks, b"")  # errors surface here, before any response is sent
        except BaseException:
            manager.__exit__(None, None, None)
            raise
        return manager, chunks, first

    try:
        manager, chunks, first = await run_in_threadpool(open_stream)
    except Exception as exc:
        log.warning("speech synthesis failed: %s", type(exc).__name__)
        return provider_error(exc, body.language)

    def body_iter():
        try:
            if first:
                yield first
            yield from chunks
        finally:
            manager.__exit__(None, None, None)

    return StreamingResponse(
        body_iter(),
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-store", "X-Audio-Format": PCM_FORMAT, "Access-Control-Expose-Headers": "X-Audio-Format"},
    )
