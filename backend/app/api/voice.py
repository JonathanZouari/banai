"""Voice chat: speech-to-text and text-to-speech proxies.

Voice only changes how a message is typed and read aloud: a transcript goes through the normal
`/api/chat` (same scope rules, validation and Confirm gate), and nothing here touches the design.
The browser never holds the OpenAI key; audio uploads and spoken text are size-capped and rate limited."""

from __future__ import annotations

import logging
from typing import Annotated

import openai
from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.chat import MAX_MESSAGE_CHARS, get_agent_client
from app.api.envelope import fail, ok
from app.api.limits import limiter
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice")

MAX_SPOKEN_CHARS = 600
# What MediaRecorder produces in the major browsers (codec parameters are ignored).
AUDIO_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}
UNAVAILABLE = "Voice is not available on this server."


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Annotated[str, Field(min_length=1, max_length=MAX_SPOKEN_CHARS)]

    @field_validator("text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value.strip()


def _voice_limit() -> str:
    return get_settings().voice_rate_limit


@router.post("/transcribe")
@limiter.limit(_voice_limit)
async def transcribe(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[openai.OpenAI | None, Depends(get_agent_client)],
):
    """Raw audio in the body (Content-Type audio/*). Returns {text}."""
    if client is None or not settings.openai_transcribe_model:
        return fail(503, "VOICE_UNAVAILABLE", UNAVAILABLE)
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    extension = AUDIO_TYPES.get(content_type)
    if extension is None:
        return fail(415, "UNSUPPORTED_AUDIO", "Unsupported audio format.")
    audio = await request.body()
    if not audio:
        return fail(422, "NO_AUDIO", "No audio was received.")
    if len(audio) > settings.max_audio_bytes:
        return fail(413, "PAYLOAD_TOO_LARGE", "The recording is too long.")
    try:
        result = await run_in_threadpool(
            client.audio.transcriptions.create,
            model=settings.openai_transcribe_model,
            file=(f"voice.{extension}", audio, content_type),
        )
    except openai.OpenAIError as error:
        logger.warning("OpenAI transcription failed: %s", type(error).__name__)  # never log audio or the key
        return fail(502, "VOICE_ERROR", "Voice is unavailable right now. Please type your message.")
    text = (getattr(result, "text", "") or "").strip()[:MAX_MESSAGE_CHARS]
    if not text:
        return fail(422, "NO_SPEECH", "I could not hear any speech. Please try again.")
    return ok({"text": text})


@router.post("/speak")
@limiter.limit(_voice_limit)
async def speak(
    request: Request,
    body: SpeakRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[openai.OpenAI | None, Depends(get_agent_client)],
):
    """Text in, MP3 audio out."""
    if client is None or not settings.openai_tts_model:
        return fail(503, "VOICE_UNAVAILABLE", UNAVAILABLE)
    try:
        speech = await run_in_threadpool(
            client.audio.speech.create,
            model=settings.openai_tts_model,
            voice=settings.openai_tts_voice,
            input=body.text,
            response_format="mp3",
        )
    except openai.OpenAIError as error:
        logger.warning("OpenAI speech failed: %s", type(error).__name__)
        return fail(502, "VOICE_ERROR", "Voice is unavailable right now.")
    return Response(content=speech.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
