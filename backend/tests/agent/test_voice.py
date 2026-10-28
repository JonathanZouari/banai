"""Voice endpoints with a fake OpenAI audio client (no network)."""

from __future__ import annotations

import threading
import time
from types import SimpleNamespace

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, RateLimitError

from app.api import voice
from app.api.agent import get_llm_client
from app.api.limits import limiter
from app.api.voice import DEFAULT_TRANSCRIBE_MODEL, DEFAULT_TTS_VOICE, PCM_FORMAT, TRANSCRIBE_PROMPT
from app.config import get_settings, get_signing_key
from app.main import create_app
from app.services import signing

WEBM = {"Content-Type": "audio/webm;codecs=opus"}
SPEECH = b"\x1a\x45\xdf\xa3" + b"x" * 3000  # webm magic bytes + enough audio to count as speech
NO_SIGNATURE = "0" * 64
PCM = b"\x01\x02" * 5000


class FakeAudio:
    def __init__(self, text="Add a shelf on the left", error=None, delay=0.0):
        self.text, self.error, self.delay, self.calls = text, error, delay, []
        self.stream_closed = False
        self.audio = SimpleNamespace(
            transcriptions=SimpleNamespace(create=self._transcribe),
            speech=SimpleNamespace(with_streaming_response=SimpleNamespace(create=self._speak)),
        )

    def _transcribe(self, **kwargs):
        self.calls.append(("transcribe", kwargs))
        time.sleep(self.delay)
        if self.error:
            raise self.error
        return SimpleNamespace(text=self.text)

    def _speak(self, **kwargs):
        self.calls.append(("speech", kwargs))
        if self.error:
            raise self.error
        fake = self

        class Stream:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                fake.stream_closed = True

            def iter_bytes(self, size):
                for i in range(0, len(PCM), size):
                    yield PCM[i : i + size]

        return Stream()


@pytest.fixture
def client_for(monkeypatch):
    limiter.reset()
    voice.reset_guards()

    def build(fake, **env):
        env = {"VOICE_ENABLED": "true", "VOICE_RATE_LIMIT": "1000/minute", **env}
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        monkeypatch.setenv("PROPOSAL_SIGNING_KEY", "test-signing-key")
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        get_settings.cache_clear()
        get_signing_key.cache_clear()
        app = create_app()
        app.dependency_overrides[get_llm_client] = lambda: fake
        return TestClient(app)

    yield build
    get_settings.cache_clear()
    get_signing_key.cache_clear()
    voice.reset_guards()


def speech_body(text, language="en", **extra):
    """A /speech request for a reply this server signed (as /api/chat returns it)."""
    return {"text": text, "language": language, "signature": signing.sign_reply(get_signing_key(), text), **extra}


def test_status_reflects_the_switch(client_for):
    assert client_for(FakeAudio()).get("/api/voice/status").json()["data"] == {"enabled": True, "maxSeconds": 20}
    assert client_for(FakeAudio(), VOICE_ENABLED="false").get("/api/voice/status").json()["data"]["enabled"] is False


def test_voice_switched_off_is_503_and_never_calls_openai(client_for):
    fake = FakeAudio()
    client = client_for(fake, VOICE_ENABLED="false")
    for response in (
        client.post("/api/voice/transcribe", content=SPEECH, headers=WEBM),
        client.post("/api/voice/speech", json=speech_body("Hello")),
    ):
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "VOICE_DISABLED"
    assert fake.calls == []


def test_transcribe_returns_the_text_without_a_language_hint(client_for):
    fake = FakeAudio(text="  Add   a shelf  ")
    response = client_for(fake).post("/api/voice/transcribe?language=en", content=SPEECH, headers=WEBM)
    assert response.json() == {"success": True, "data": {"text": "Add a shelf"}}
    _, call = fake.calls[0]
    assert call["model"] == DEFAULT_TRANSCRIBE_MODEL and call["prompt"] == TRANSCRIBE_PROMPT
    assert "language" not in call
    assert call["file"][0] == "speech.webm"


def test_transcribe_model_is_configurable(client_for):
    fake = FakeAudio()
    client_for(fake, OPENAI_TRANSCRIBE_MODEL="gpt-4o-transcribe").post("/api/voice/transcribe", content=SPEECH, headers=WEBM)
    assert fake.calls[0][1]["model"] == "gpt-4o-transcribe"


@pytest.mark.parametrize(("headers", "body", "status", "code"), [
    ({"Content-Type": "text/plain"}, SPEECH, 415, "UNSUPPORTED_AUDIO"),
    (WEBM, b"x" * 3000, 415, "UNSUPPORTED_AUDIO"),
    (WEBM, b"\x1a\x45\xdf\xa3" + b"x" * 600_001, 413, "AUDIO_TOO_LARGE"),
    (WEBM, b"", 422, "NO_SPEECH"),
    (WEBM, b"\x1a\x45\xdf\xa3" + b"x" * 100, 422, "NO_SPEECH"),
], ids=["wrong-type", "wrong-magic-bytes", "too-large", "empty", "tap"])
def test_transcribe_rejects_bad_audio_without_calling_openai(client_for, headers, body, status, code):
    fake = FakeAudio()
    response = client_for(fake).post("/api/voice/transcribe?language=en", content=body, headers=headers)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert fake.calls == []


@pytest.mark.parametrize("text", ["   ", "hello\x07", "hi‮"], ids=["blank", "control-char", "bidi"])
def test_transcript_that_is_not_a_valid_chat_message_is_no_speech(client_for, text):
    response = client_for(FakeAudio(text=text)).post("/api/voice/transcribe", content=SPEECH, headers=WEBM)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_SPEECH"


def test_a_slow_transcription_does_not_block_other_requests(client_for):
    client = client_for(FakeAudio(delay=1.5))
    worker = threading.Thread(target=lambda: client.post("/api/voice/transcribe", content=SPEECH, headers=WEBM))
    worker.start()
    time.sleep(0.2)  # the transcription is now in flight
    started = time.monotonic()
    assert client.get("/api/health").status_code == 200
    assert time.monotonic() - started < 1.0  # answered while the upstream call is still running
    worker.join()


def test_upstream_errors_are_not_echoed(client_for):
    fake = FakeAudio(error=RuntimeError("secret upstream detail"))
    client = client_for(fake)
    for response in (
        client.post("/api/voice/transcribe?language=en", content=SPEECH, headers=WEBM),
        client.post("/api/voice/speech", json=speech_body("Hello")),
    ):
        assert response.status_code == 502
        assert "secret" not in response.text


@pytest.mark.parametrize(("code", "status", "app_code"), [("insufficient_quota", 503, "AGENT_QUOTA"), ("rate_limit_exceeded", 429, "AGENT_BUSY")])
def test_openai_quota_and_rate_limit_are_distinct(client_for, code, status, app_code):
    error = RateLimitError("limit", response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body={"code": code})
    error.code = code
    response = client_for(FakeAudio(error=error)).post("/api/voice/transcribe", content=SPEECH, headers=WEBM)
    assert response.status_code == status and response.json()["error"]["code"] == app_code


def test_agent_disabled_is_503(client_for):
    client = client_for(None)
    assert client.post("/api/voice/transcribe", content=SPEECH, headers=WEBM).status_code == 503
    assert client.post("/api/voice/speech", json={"text": "Hello", "signature": NO_SIGNATURE}).status_code == 503


def test_speech_streams_pcm_for_a_signed_reply(client_for):
    fake = FakeAudio()
    response = client_for(fake).post("/api/voice/speech", json=speech_body("הנה ההצעה שלי.", "he"))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/octet-stream")
    assert response.headers["x-audio-format"] == PCM_FORMAT and response.content == PCM
    _, call = fake.calls[0]
    assert call["voice"] == DEFAULT_TTS_VOICE and call["input"] == "הנה ההצעה שלי." and call["response_format"] == "pcm"
    assert "Hebrew" in call["instructions"]
    assert fake.stream_closed  # the OpenAI stream is always closed


def test_speech_errors_before_streaming_use_the_envelope(client_for):
    fake = FakeAudio(error=APIConnectionError(request=httpx.Request("POST", "https://x")))
    response = client_for(fake).post("/api/voice/speech", json=speech_body("Hello"))
    assert response.status_code == 502 and response.json()["error"]["code"] == "AGENT_ERROR"


def test_hebrew_unit_abbreviations_are_spoken_as_words(client_for):
    fake = FakeAudio()
    client_for(fake).post("/api/voice/speech", json=speech_body('הרוחב יהיה 240 ס"מ ועובי 18 מ״מ.', "he"))
    assert fake.calls[0][1]["input"] == "הרוחב יהיה 240 סנטימטר ועובי 18 מילימטר."


def test_speech_reads_one_piece_of_the_signed_reply(client_for):
    fake = FakeAudio()
    reply = "Here is my proposal.  It adds a shelf at 100 cm."
    response = client_for(fake).post("/api/voice/speech", json=speech_body(reply, piece="It adds a shelf at 100 cm."))
    assert response.status_code == 200
    assert fake.calls[0][1]["input"] == "It adds a shelf at 100 cm."


def test_speech_only_reads_the_agents_own_replies(client_for):
    fake = FakeAudio()
    client = client_for(fake)
    forged = {**speech_body("Here is my proposal."), "text": "Any text someone wants spoken."}
    foreign_piece = speech_body("Here is my proposal.", piece="Any text someone wants spoken.")
    for body in (forged, foreign_piece):
        response = client.post("/api/voice/speech", json=body)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "BAD_REPLY_SIGNATURE"
    assert fake.calls == []


def test_a_piece_longer_than_the_speech_cap_is_refused(client_for):
    fake = FakeAudio()
    reply = "word " * 150
    response = client_for(fake).post("/api/voice/speech", json=speech_body(reply.strip()))
    assert response.status_code == 403 and fake.calls == []


@pytest.mark.parametrize("body", [
    {"text": "", "signature": NO_SIGNATURE},
    {"text": "x" * 1001, "signature": NO_SIGNATURE},
    {"text": "hi\x00", "signature": NO_SIGNATURE},
    {"text": "hi", "signature": NO_SIGNATURE, "extra": 1},
    {"text": "hi"},
    {"text": "hi", "signature": NO_SIGNATURE, "piece": ""},
], ids=["empty", "too-long", "control-char", "extra-field", "no-signature", "empty-piece"])
def test_speech_validates_the_request(client_for, body):
    fake = FakeAudio()
    response = client_for(fake).post("/api/voice/speech", json=body)
    assert response.status_code == 422 and "xxx" not in response.text
    assert fake.calls == []


def test_per_ip_rate_limit(client_for):
    client = client_for(FakeAudio(), VOICE_RATE_LIMIT="2/minute")
    codes = [client.post("/api/voice/transcribe", content=SPEECH, headers=WEBM).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_hourly_cap_and_daily_budget(client_for):
    client = client_for(FakeAudio(), VOICE_HOURLY_CAP="2")
    assert [client.post("/api/voice/transcribe", content=SPEECH, headers=WEBM).status_code for _ in range(3)] == [200, 200, 429]
    voice.reset_guards()
    client = client_for(FakeAudio(), VOICE_DAILY_BUDGET_USD="0.00001")
    response = client.post("/api/voice/transcribe", content=SPEECH, headers=WEBM)
    assert response.status_code == 429 and response.json()["error"]["code"] == "VOICE_BUDGET"


def test_budget_counts_speech_and_stops_openai_calls(client_for):
    fake = FakeAudio()
    client = client_for(fake, VOICE_DAILY_BUDGET_USD="0.003")
    reply = "x" * 400
    codes = [client.post("/api/voice/speech", json=speech_body(reply)).status_code for _ in range(5)]
    assert 429 in codes and codes.count(200) < 5 and len(fake.calls) == codes.count(200)


def test_audio_limit_does_not_loosen_json_routes(client_for):
    client = client_for(FakeAudio())
    big = {"messages": [{"role": "user", "text": "x"}], "design": {"pad": "x" * 400_000}, "revision": 1}
    assert client.post("/api/chat", json=big).status_code == 413
