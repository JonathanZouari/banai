"""Voice for the AI designer: speak a reply, or transcribe the customer's speech.

Both proxy ElevenLabs so the key stays on the server. Inputs are bounded (text length,
audio size and type); the browser falls back to its own voice when these return an error.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from app.agent.language import Language
from app.api.agent import MESSAGE_TEXT_PATTERN, error
from app.config import Settings, get_settings
from app.services import elevenlabs

router = APIRouter(prefix="/api/voice")

MAX_SPEAK_CHARS = 600  # agent replies are ~150 characters; this also caps credit use per call
MAX_AUDIO_BYTES = 2 * 1024 * 1024  # ~60 s of browser opus audio
MAX_TRANSCRIPT_CHARS = 2000  # the chat message limit
AUDIO_TYPE = re.compile(r"^audio/(webm|ogg|mp4)(;.*)?$")

MESSAGES: dict[str, dict[str, str]] = {
    "VOICE_UNAVAILABLE": {"he": "הקול עדיין לא מוגדר בשרת הזה.", "en": "Voice is not configured on this server."},
    "VOICE_ERROR": {"he": "שירות הקול לא זמין כרגע.", "en": "The voice service is unavailable right now."},
    "AUDIO_TYPE": {"he": "סוג ההקלטה לא נתמך.", "en": "This recording format is not supported."},
    "AUDIO_TOO_LARGE": {"he": "ההקלטה ארוכה מדי.", "en": "The recording is too long."},
    "AUDIO_EMPTY": {"he": "ההקלטה ריקה.", "en": "The recording is empty."},
}


def localized(status: int, code: str, language: str) -> Response:
    return error(status, code, MESSAGES[code][language])


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, Field(min_length=1, max_length=MAX_SPEAK_CHARS, pattern=MESSAGE_TEXT_PATTERN)]
    language: Language = "he"


@router.post("/speak")
def speak(request: SpeakRequest, settings: Annotated[Settings, Depends(get_settings)]):
    if not settings.voice_enabled:
        return localized(503, "VOICE_UNAVAILABLE", request.language)
    try:
        audio = elevenlabs.synthesize(request.text, request.language, settings)
    except elevenlabs.VoiceUnavailable:
        return localized(502, "VOICE_ERROR", request.language)
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


async def _read_limited(request: Request) -> bytes | None:
    """The request body, or None once it exceeds MAX_AUDIO_BYTES (stops reading early)."""
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_AUDIO_BYTES:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/transcribe")
async def transcribe(request: Request, settings: Annotated[Settings, Depends(get_settings)], language: Language = "he"):
    if not settings.voice_enabled:
        return localized(503, "VOICE_UNAVAILABLE", language)
    content_type = request.headers.get("content-type", "").strip().lower()
    if not AUDIO_TYPE.match(content_type):
        return localized(415, "AUDIO_TYPE", language)
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_AUDIO_BYTES:
        return localized(413, "AUDIO_TOO_LARGE", language)
    audio = await _read_limited(request)
    if audio is None:
        return localized(413, "AUDIO_TOO_LARGE", language)
    if not audio:
        return localized(422, "AUDIO_EMPTY", language)
    try:
        # The upstream call blocks; run it off the event loop like FastAPI's sync endpoints.
        text = await run_in_threadpool(elevenlabs.transcribe, audio, content_type.split(";")[0], language, settings)
    except elevenlabs.VoiceUnavailable:
        return localized(502, "VOICE_ERROR", language)
    return {"success": True, "data": {"text": text.strip()[:MAX_TRANSCRIPT_CHARS]}}
