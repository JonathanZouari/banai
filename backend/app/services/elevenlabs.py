"""ElevenLabs text-to-speech and speech-to-text, called from the backend only.

The API key never leaves the server. Uses the standard library (no extra dependency); any
HTTP or network failure becomes VoiceUnavailable, and the upstream body is never echoed.
"""

from __future__ import annotations

import json
import secrets
import urllib.error
import urllib.parse
import urllib.request

from app.config import Settings

API_BASE = "https://api.elevenlabs.io/v1"
TIMEOUT_SECONDS = 30


class VoiceUnavailable(Exception):
    """ElevenLabs could not be reached or refused the request (quota, key, voice, network)."""


def _send(request: urllib.request.Request) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 (fixed https host)
            return response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise VoiceUnavailable(type(exc).__name__) from None


def synthesize(text: str, language: str, settings: Settings) -> bytes:
    """Speak `text` in `language` ('he' | 'en'); returns MP3 bytes."""
    body = json.dumps({"text": text, "model_id": settings.tts_model, "language_code": language}).encode()
    request = urllib.request.Request(
        f"{API_BASE}/text-to-speech/{urllib.parse.quote(settings.voice_id, safe='')}?output_format=mp3_44100_64",
        data=body,
        method="POST",
        headers={"xi-api-key": settings.elevenlabs_api_key.strip(), "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    audio = _send(request)
    if not audio:
        raise VoiceUnavailable("empty audio")
    return audio


def multipart(fields: dict[str, str], file_field: str, filename: str, content_type: str, data: bytes) -> tuple[bytes, str]:
    """A multipart/form-data body and its Content-Type header (with the boundary)."""
    boundary = f"banai-{secrets.token_hex(12)}"
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode()
    )
    parts.append(data)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def transcribe(audio: bytes, content_type: str, language: str, settings: Settings) -> str:
    """Transcribe a short recording; returns the recognised text (may be empty)."""
    body, header = multipart(
        {"model_id": settings.stt_model, "language_code": language}, "file", "speech.webm", content_type, audio,
    )
    request = urllib.request.Request(
        f"{API_BASE}/speech-to-text",
        data=body,
        method="POST",
        headers={"xi-api-key": settings.elevenlabs_api_key.strip(), "Content-Type": header, "Accept": "application/json"},
    )
    try:
        result = json.loads(_send(request))
    except (ValueError, UnicodeDecodeError):
        raise VoiceUnavailable("invalid response") from None
    text = result.get("text") if isinstance(result, dict) else None
    if not isinstance(text, str):
        raise VoiceUnavailable("no text")
    return text
