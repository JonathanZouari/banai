"""Voice chat: speech-to-text and text-to-speech proxies.

Voice only changes how a message is typed and read aloud: a transcript goes through the normal
`/api/chat` (same scope rules, validation and Confirm gate), and nothing here touches the design.
The browser never holds the OpenAI key; audio uploads and spoken text are size-capped and rate limited,
and only replies this server signed can be read aloud (this is not an open text-to-speech proxy)."""

from __future__ import annotations

import logging
from typing import Annotated

import openai
from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from app.agent.language import Language
from app.api.chat import MAX_MESSAGE_CHARS, get_agent_client
from app.api.envelope import ok
from app.api.limits import limiter
from app.api.messages import localized
from app.config import Settings, get_settings
from app.services.signing import SigningUnavailable, verify_reply

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice")

MAX_SPOKEN_CHARS = 1000
HEX64 = r"^[0-9a-f]{64}$"
# What MediaRecorder produces in the major browsers (codec parameters are ignored).
AUDIO_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
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


def spoken(text: str) -> str:
    for short, word in SPOKEN_UNITS.items():
        text = text.replace(short, word)
    return text


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, Field(min_length=1, max_length=MAX_SPOKEN_CHARS)]
    language: Language = "en"
    signature: Annotated[str, Field(pattern=HEX64)]  # replySignature from /api/chat


def _voice_limit() -> str:
    return get_settings().voice_rate_limit


@router.post("/transcribe")
@limiter.limit(_voice_limit)
async def transcribe(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[openai.OpenAI | None, Depends(get_agent_client)],
    language: Annotated[Language, Query()] = "en",
):
    """Raw audio in the body (Content-Type audio/*). Returns {text}. No language hint goes to the model:
    the customer may speak either language. `language` only localizes the error messages."""
    if client is None or not settings.openai_transcribe_model:
        return localized(503, "VOICE_UNAVAILABLE", language)
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    extension = AUDIO_TYPES.get(content_type)
    if extension is None:
        return localized(415, "UNSUPPORTED_AUDIO", language)
    audio = await request.body()
    if not audio:
        return localized(422, "NO_AUDIO", language)
    if len(audio) > settings.max_audio_bytes:
        return localized(413, "PAYLOAD_TOO_LARGE", language)
    model = settings.openai_transcribe_model
    try:
        result = await run_in_threadpool(
            client.audio.transcriptions.create,
            model=model,
            file=(f"voice.{extension}", audio, content_type),
            **({"prompt": TRANSCRIBE_PROMPT} if model in PROMPTABLE_MODELS else {}),
        )
    except openai.OpenAIError as error:
        logger.warning("OpenAI transcription failed: %s", type(error).__name__)  # never log audio or the key
        return localized(502, "VOICE_ERROR", language)
    text = " ".join((getattr(result, "text", "") or "").split())[:MAX_MESSAGE_CHARS]
    if not text:
        return localized(422, "NO_SPEECH", language)
    return ok({"text": text})


@router.post("/speech")
@limiter.limit(_voice_limit)
async def speech(
    request: Request,
    body: SpeechRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[openai.OpenAI | None, Depends(get_agent_client)],
):
    """A signed agent reply in, MP3 audio out."""
    if client is None or not settings.openai_tts_model:
        return localized(503, "VOICE_UNAVAILABLE", body.language)
    try:
        genuine = verify_reply(body.text, body.signature, settings.proposal_signing_key)
    except SigningUnavailable:
        return localized(503, "VOICE_UNAVAILABLE", body.language)
    if not genuine:
        return localized(403, "BAD_REPLY_SIGNATURE", body.language)
    try:
        audio = await run_in_threadpool(
            client.audio.speech.create,
            model=settings.openai_tts_model,
            voice=settings.openai_tts_voice,
            input=spoken(body.text),
            instructions=SPEECH_STYLE,
            response_format="mp3",
        )
    except openai.OpenAIError as error:
        logger.warning("OpenAI speech failed: %s", type(error).__name__)
        return localized(502, "VOICE_ERROR", body.language)
    return Response(content=audio.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
