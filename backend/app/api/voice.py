"""Voice endpoints: speech to text, text to speech, status.

Voice only turns speech into text for the chat composer and reads replies aloud. It never changes
a design and never confirms a proposal. Audio and text are not stored or logged.
"""

from __future__ import annotations

import re
import time
from functools import lru_cache
from collections import deque
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from openai import APIError, OpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.api.chat import limiter
from app.api.errors import api_error, map_openai_error
from app.config import Settings, get_settings

router = APIRouter(prefix="/api/voice")

MAX_TRANSCRIPT_CHARS = 2000  # same limit as a typed chat message
MIN_AUDIO_BYTES = 800  # shorter than this is a tap, not speech
AUDIO_TYPES = {
    "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
}
# Conservative cost estimates for the in-app budget guard (not accounting).
STT_USD_PER_MIN = 0.006
TTS_USD_PER_MIN = 0.015
# Low on purpose: the byte cap is not a duration cap (a very low bitrate file can hold minutes of audio), so
# charge as if the audio were long. Normal browser speech is 4000+ B/s, so real clips are overcharged about 4x.
ASSUMED_BYTES_PER_SECOND = 1000
MAX_CHARGED_SECONDS = 600
SPOKEN_CHARS_PER_SECOND = 14
_SENTENCE_END = re.compile(r"[.!?…](?=\s|$)")

_lock = Lock()
_recent: deque[float] = deque()
_spend: deque[tuple[float, float]] = deque()


def _prune(now: float) -> None:
    while _recent and now - _recent[0] > 3600:
        _recent.popleft()
    while _spend and now - _spend[0][0] > 86400:
        _spend.popleft()


def reserve(settings: Settings, estimated_usd: float) -> None:
    """Count this request against the hourly cap and daily budget, or refuse it."""
    now = time.monotonic()
    with _lock:
        _prune(now)
        if len(_recent) >= settings.voice_hourly_cap:
            raise api_error(429, "VOICE_BUSY", "Voice is busy right now. Please try again later.")
        if sum(usd for _, usd in _spend) + estimated_usd > settings.voice_daily_budget_usd:
            raise api_error(429, "VOICE_BUDGET", "Voice is paused for today. You can keep typing.")
        _recent.append(now)
        _spend.append((now, estimated_usd))


def reset_guards() -> None:
    with _lock:
        _recent.clear()
        _spend.clear()


def require_voice(settings: Annotated[Settings, Depends(get_settings)]) -> Settings:
    if not settings.voice_enabled:
        raise api_error(503, "VOICE_DISABLED", "Voice is not enabled.")
    if not settings.agent_configured:
        raise api_error(503, "AGENT_NOT_CONFIGURED", "The AI agent is not configured on the server.")
    return settings


@lru_cache(maxsize=2)
def _audio_client(api_key: str, timeout: float):
    """One client per process, so connections are reused (a new TLS handshake per request costs about 0.3 s)."""
    return OpenAI(api_key=api_key, timeout=timeout, max_retries=1).audio


def get_voice_client(settings: Annotated[Settings, Depends(require_voice)]):
    return _audio_client(settings.openai_api_key.get_secret_value(), settings.chat_timeout_s)


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


def clean_transcript(text: str) -> str:
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f-\x9f​-‍  ‪-‮⁦-⁩﻿]", "", text or "")
    return re.sub(r"\s+", " ", text).strip()[:MAX_TRANSCRIPT_CHARS]


def shorten_for_speech(text: str, limit: int) -> str:
    """At most `limit` characters, cut at the last sentence end (else the last space)."""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    window = text[:limit]
    ends = [m.end() for m in _SENTENCE_END.finditer(window)]
    if ends and ends[-1] >= limit // 3:
        return window[: ends[-1]].strip()
    return window[: window.rfind(" ")].strip() if " " in window else window


async def read_capped(request: Request, limit: int) -> bytes | None:
    """Read the body in chunks and stop as soon as it passes `limit` (None = too large)."""
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/status")
def status(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    enabled = settings.voice_enabled and settings.agent_configured
    return {"success": True, "data": {"enabled": enabled, "maxSeconds": settings.voice_max_seconds}}


@router.post("/transcribe")
@limiter.limit(lambda: get_settings().voice_rate_limit)
async def transcribe(
    request: Request,
    settings: Annotated[Settings, Depends(require_voice)],
    client=Depends(get_voice_client),
    language: Annotated[str | None, Query(pattern="^(en|he)$")] = None,
) -> dict:
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in AUDIO_TYPES:
        raise api_error(415, "UNSUPPORTED_AUDIO", "This audio format is not supported.")
    data = await read_capped(request, settings.voice_max_audio_bytes)
    if data is None:
        raise api_error(413, "AUDIO_TOO_LONG", f"Recordings can be up to {settings.voice_max_seconds} seconds.")
    if len(data) < MIN_AUDIO_BYTES:
        return {"success": True, "data": {"text": "", "noSpeech": True}}
    kind = sniff_audio(data)
    if kind is None:
        raise api_error(415, "UNSUPPORTED_AUDIO", "This audio format is not supported.")
    seconds = min(len(data) / ASSUMED_BYTES_PER_SECOND, MAX_CHARGED_SECONDS)
    reserve(settings, seconds / 60 * STT_USD_PER_MIN)

    def call() -> str:
        options = {"language": language} if language else {}
        result = client.transcriptions.create(
            model=settings.openai_stt_model, file=(f"voice.{kind}", data, f"audio/{kind}"), response_format="json", **options
        )
        return getattr(result, "text", "") or ""

    try:
        text = clean_transcript(await run_in_threadpool(call))
    except APIError as error:
        raise map_openai_error(error, "VOICE") from None
    return {"success": True, "data": {"text": text, "noSpeech": not text}}


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=1500)


PCM_FORMAT = "pcm16;rate=24000;channels=1"  # raw 16-bit little-endian mono, so playback can start at the first bytes


@router.post("/speak")
@limiter.limit(lambda: get_settings().voice_rate_limit)
async def speak(
    request: Request,
    body: SpeakRequest,
    settings: Annotated[Settings, Depends(require_voice)],
    client=Depends(get_voice_client),
) -> StreamingResponse:
    """Streams the spoken reply. The first audio arrives about 1 s after the request, instead of the whole clip after 3 to 5 s."""
    text = shorten_for_speech(body.text, settings.voice_tts_max_chars)
    if not text:
        raise api_error(422, "INVALID_REQUEST", "The request is invalid.")
    reserve(settings, len(text) / SPOKEN_CHARS_PER_SECOND / 60 * TTS_USD_PER_MIN)

    def open_stream():
        manager = client.speech.with_streaming_response.create(
            model=settings.openai_tts_model, voice=settings.openai_tts_voice, input=text, response_format="pcm"
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
    except APIError as error:
        raise map_openai_error(error, "VOICE") from None

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
