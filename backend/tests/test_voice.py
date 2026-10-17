"""Voice endpoints with ElevenLabs faked (no network)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import voice
from app.config import get_settings
from app.main import create_app
from app.services import elevenlabs

MP3 = b"ID3\x04fake-mp3"


@pytest.fixture
def client(monkeypatch):
    """A client with voice configured; ElevenLabs calls are replaced per test."""
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-voice-key")
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


@pytest.fixture
def no_voice(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "")
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()


def failing(*_args, **_kwargs):
    raise elevenlabs.VoiceUnavailable("HTTPError: secret upstream body")


def test_health_reports_voice_configured(client):
    assert client.get("/api/health").json()["data"]["voice"] is True


def test_health_reports_voice_missing(no_voice):
    assert no_voice.get("/api/health").json()["data"]["voice"] is False


def test_without_a_key_both_endpoints_say_unavailable(no_voice):
    speak = no_voice.post("/api/voice/speak", json={"text": "שלום"})
    assert speak.status_code == 503
    assert speak.json()["error"]["code"] == "VOICE_UNAVAILABLE"
    heard = no_voice.post("/api/voice/transcribe", content=b"x", headers={"Content-Type": "audio/webm"})
    assert heard.status_code == 503


def test_speak_returns_mp3_for_hebrew_text(client, monkeypatch):
    calls = []
    monkeypatch.setattr(elevenlabs, "synthesize", lambda text, language, settings: calls.append((text, language)) or MP3)
    response = client.post("/api/voice/speak", json={"text": "מדף בגובה 80 ס\"מ", "language": "he"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == MP3
    assert calls == [("מדף בגובה 80 ס\"מ", "he")]


@pytest.mark.parametrize("text", ["", "x" * (voice.MAX_SPEAK_CHARS + 1), "bad‮text"], ids=["empty", "too-long", "bidi-control"])
def test_speak_rejects_empty_long_or_unsafe_text(client, monkeypatch, text):
    monkeypatch.setattr(elevenlabs, "synthesize", lambda *a: pytest.fail("must not call ElevenLabs"))
    assert client.post("/api/voice/speak", json={"text": text}).status_code == 422


def test_upstream_failure_is_502_without_leaking_details(client, monkeypatch):
    monkeypatch.setattr(elevenlabs, "synthesize", failing)
    response = client.post("/api/voice/speak", json={"text": "hello", "language": "en"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "VOICE_ERROR"
    assert "secret" not in response.text


def test_transcribe_returns_trimmed_text(client, monkeypatch):
    seen = {}

    def fake(audio, content_type, language, settings):
        seen.update(audio=audio, content_type=content_type, language=language)
        return "  תוסיף מגירה למטה  "

    monkeypatch.setattr(elevenlabs, "transcribe", fake)
    response = client.post("/api/voice/transcribe?language=he", content=b"opus-bytes", headers={"Content-Type": "audio/webm;codecs=opus"})
    assert response.status_code == 200
    assert response.json()["data"]["text"] == "תוסיף מגירה למטה"
    assert seen == {"audio": b"opus-bytes", "content_type": "audio/webm", "language": "he"}


@pytest.mark.parametrize(("body", "content_type", "status"), [
    (b"x", "application/json", 415),
    (b"x", "text/plain", 415),
    (b"", "audio/webm", 422),
    (b"x" * (voice.MAX_AUDIO_BYTES + 1), "audio/webm", 413),
], ids=["json", "text", "empty", "too-large"])
def test_transcribe_rejects_bad_audio(client, monkeypatch, body, content_type, status):
    monkeypatch.setattr(elevenlabs, "transcribe", lambda *a: pytest.fail("must not call ElevenLabs"))
    response = client.post("/api/voice/transcribe", content=body, headers={"Content-Type": content_type})
    assert response.status_code == status


def test_transcribe_upstream_failure_is_502(client, monkeypatch):
    monkeypatch.setattr(elevenlabs, "transcribe", failing)
    response = client.post("/api/voice/transcribe", content=b"x", headers={"Content-Type": "audio/ogg"})
    assert response.status_code == 502
    assert "secret" not in response.text


def test_multipart_body_has_fields_and_file():
    body, header = elevenlabs.multipart({"model_id": "scribe_v2", "language_code": "he"}, "file", "speech.webm", "audio/webm", b"AUDIO")
    boundary = header.split("boundary=")[1]
    assert header.startswith("multipart/form-data; boundary=banai-")
    assert body.startswith(f"--{boundary}\r\n".encode())
    assert body.endswith(f"\r\n--{boundary}--\r\n".encode())
    assert b'name="model_id"\r\n\r\nscribe_v2\r\n' in body
    assert b'name="language_code"\r\n\r\nhe\r\n' in body
    assert b'name="file"; filename="speech.webm"\r\nContent-Type: audio/webm\r\n\r\nAUDIO\r\n' in body


def test_service_turns_network_errors_into_voice_unavailable(monkeypatch):
    import urllib.error

    def refuse(*_a, **_k):
        raise urllib.error.HTTPError("https://api.elevenlabs.io", 401, "quota_exceeded", {}, None)

    monkeypatch.setattr(elevenlabs.urllib.request, "urlopen", refuse)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    get_settings.cache_clear()
    try:
        with pytest.raises(elevenlabs.VoiceUnavailable):
            elevenlabs.synthesize("hi", "en", get_settings())
    finally:
        get_settings.cache_clear()
