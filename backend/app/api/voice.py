"""POST /api/voice/transcribe: speech to text for the chat's push-to-talk. The customer's OpenAI key
comes with each request; the key and the audio pass through memory only and are never stored or logged.

The transcript is only text for the chat composer: it goes through the same agent turn as a typed
message, so any design change still waits for the customer's confirmation.
"""

import threading

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.agent.chat import AgentError
from app.agent.transcribe import transcribe
from app.ai.verify import KEY_PATTERN
from app.config import get_settings

router = APIRouter(prefix="/api/voice")

# 30 s of Opus at the recorder's 64 kb/s is about 240 KB; 1 MiB leaves room for other codecs.
# The body cap for this route (app/body_limit.py) is this plus the multipart overhead.
MAX_AUDIO_BYTES = 1024 * 1024
# A cheap DoS guard on an unauthenticated endpoint: two transcriptions at a time per process.
# A request never waits for a slot: waiting would pin a worker thread shared by every sync endpoint.
_slots = threading.BoundedSemaphore(2)

# Allow-listed content types -> (container family, file extension sent to OpenAI).
AUDIO_TYPES = {
    "audio/webm": ("webm", "webm"),
    "audio/ogg": ("ogg", "ogg"),
    "audio/mp4": ("mp4", "mp4"),
    "audio/m4a": ("mp4", "m4a"),
    "audio/x-m4a": ("mp4", "m4a"),
    "audio/mpeg": ("mp3", "mp3"),
    "audio/mp3": ("mp3", "mp3"),
    "audio/wav": ("wav", "wav"),
    "audio/wave": ("wav", "wav"),
    "audio/x-wav": ("wav", "wav"),
    "audio/vnd.wave": ("wav", "wav"),
}


def sniff_audio(data: bytes) -> str | None:
    """The container family from the first bytes, or None. The declared type must agree with it."""
    if data[:4] == b"\x1a\x45\xdf\xa3":  # EBML header (WebM/Matroska)
        return "webm"
    if data[:4] == b"OggS":
        return "ogg"
    if data[4:8] == b"ftyp":  # ISO base media (MP4/M4A)
        return "mp4"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):  # ID3 tag or MPEG frame sync
        return "mp3"
    return None


def get_transcriber():
    return transcribe


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "data": None, "error": {"code": code, "message": message}},
    )


# Both fields are optional in the signature and checked here, so a missing field gets our own code.
# A field of the wrong kind (audio sent as text) is a 422 from the app-wide handler, which echoes nothing.
@router.post("/transcribe")
def transcribe_audio(
    api_key: str = Form("", alias="apiKey"),
    audio: UploadFile | None = File(None),
    transcriber=Depends(get_transcriber),
):
    api_key = api_key.strip()
    if not KEY_PATTERN.fullmatch(api_key):
        return _error(400, "INVALID_FORMAT", "Add a valid OpenAI API key in AI settings.")
    data = audio.file.read(MAX_AUDIO_BYTES + 1) if audio is not None else b""
    if not data:
        return _error(400, "EMPTY_AUDIO", "The recording is empty.")
    if len(data) > MAX_AUDIO_BYTES:
        return _error(413, "PAYLOAD_TOO_LARGE", "The recording is too large.")
    declared = (audio.content_type or "").split(";")[0].strip().lower()
    family, extension = AUDIO_TYPES.get(declared, (None, None))
    if family is None or sniff_audio(data) != family:
        return _error(415, "UNSUPPORTED_MEDIA", "Send WebM, Ogg, MP4, MP3 or WAV audio.")
    if not _slots.acquire(blocking=False):
        return _error(429, "BUSY", "Transcription is busy. Try again in a moment.")
    try:
        text = transcriber(api_key, data, f"voice.{extension}", declared, get_settings().openai_transcribe_model or None)
    except AgentError as error:
        return _error(error.status_code, error.code, error.message)
    finally:
        _slots.release()
    return {"success": True, "data": {"text": text}}
