"""POST /api/voice/transcribe: validation, the OpenAI call (against a fake client), the DoS limits, and
that neither the key nor the audio ever reaches a response or the log."""

import asyncio
import logging
import threading
import time
from functools import partial
from types import SimpleNamespace as NS

import httpx2
import openai
import pytest
from fastapi.testclient import TestClient

from app.agent import transcribe as agent_transcribe
from app.agent.transcribe import PROMPT, pick_transcribe_model, transcribe
from app.api import voice
from app.api.voice import MAX_AUDIO_BYTES, get_transcriber, sniff_audio
from app.body_limit import DOSSIER_MAX_BODY_BYTES, MAX_BODY_BYTES, ROUTE_LIMITS, VOICE_MAX_BODY_BYTES, BodySizeLimitMiddleware
from app.config import get_settings
from app.main import create_app

KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ"
MARKER = b"AUDIO-SECRET-MARKER"
WEBM = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01" + MARKER + b"\x00" * 200
OGG = b"OggS\x00\x02" + MARKER + b"\x00" * 200
MP4 = b"\x00\x00\x00\x1cftypM4A \x00\x00\x00\x00" + MARKER + b"\x00" * 200
MP3_ID3 = b"ID3\x04\x00\x00" + MARKER + b"\x00" * 200
MP3_FRAME = b"\xff\xfb\x90\x64" + MARKER + b"\x00" * 200
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + MARKER + b"\x00" * 200


def _make_app():
    app = create_app()
    if not any(getattr(route, "path", "") == "/api/voice/transcribe" for route in app.routes):
        app.include_router(voice.router)  # until app/main.py includes the router
    return app


app = _make_app()


def post(client, audio=WEBM, content_type="audio/webm;codecs=opus", key=KEY, **kwargs):
    files = {"audio": ("blob", audio, content_type)} if audio is not None else None
    data = {"apiKey": key} if key is not None else None
    return client.post("/api/voice/transcribe", data=data, files=files, **kwargs)


@pytest.fixture
def api():
    """The endpoint with `runner` in place of the transcriber; returns (client, the calls it received)."""
    calls = []

    def use(runner=lambda *args: "שלום"):
        def recording(*args):
            calls.append(args)
            return runner(*args)

        app.dependency_overrides[get_transcriber] = lambda: recording
        return TestClient(app), calls

    yield use
    app.dependency_overrides.clear()


class FakeOpenAI:
    def __init__(self, models=("gpt-transcribe", "gpt-5.4-mini", "whisper-1"), text=" מדף נוסף בתא השמאלי ", error=None):
        self._models, self._text, self._error = models, text, error
        self.listed, self.created, self.closed = 0, [], False
        self.models = NS(list=self._list)
        self.audio = NS(transcriptions=NS(create=self._create))

    def _list(self):
        self.listed += 1
        return [NS(id=model_id) for model_id in self._models]

    def _create(self, **kwargs):
        self.created.append(kwargs)
        if self._error:
            raise self._error
        return NS(text=self._text)

    def close(self):
        self.closed = True


@pytest.fixture
def real_transcriber():
    """The endpoint with the real transcribe() talking to `fake`; returns (client, the factory's kwargs)."""
    agent_transcribe._cache.clear()

    def use(fake):
        made = []

        def factory(**kwargs):
            made.append(kwargs)
            return fake

        app.dependency_overrides[get_transcriber] = lambda: partial(transcribe, client_factory=factory)
        return TestClient(app), made

    yield use
    app.dependency_overrides.clear()
    agent_transcribe._cache.clear()


# --- success ---------------------------------------------------------------------------------------


def test_returns_the_transcript_and_passes_the_audio_on(api):
    client, calls = api(lambda *args: "שלוש מגירות בתא האמצעי")
    response = post(client)
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"text": "שלוש מגירות בתא האמצעי"}}
    assert calls == [(KEY, WEBM, "voice.webm", "audio/webm", None)]
    assert KEY not in response.text


@pytest.mark.parametrize(("content_type", "audio", "filename"), [
    ("audio/webm;codecs=opus", WEBM, "voice.webm"),
    ("audio/ogg; codecs=opus", OGG, "voice.ogg"),
    ("audio/mp4", MP4, "voice.mp4"),
    ("audio/x-m4a", MP4, "voice.m4a"),
    ("audio/mpeg", MP3_ID3, "voice.mp3"),
    ("AUDIO/MPEG", MP3_FRAME, "voice.mp3"),
    ("audio/wav", WAV, "voice.wav"),
])
def test_every_allowed_format_is_accepted_with_a_server_chosen_file_name(api, content_type, audio, filename):
    client, calls = api()
    assert post(client, audio=audio, content_type=content_type).status_code == 200
    assert calls[0][2] == filename  # the client's file name ("blob") is never used


def test_the_configured_model_is_passed_on(api, monkeypatch):
    monkeypatch.setattr(get_settings(), "openai_transcribe_model", "my-transcriber")
    client, calls = api()
    assert post(client).status_code == 200
    assert calls[0][4] == "my-transcriber"


def test_real_transcribe_picks_a_model_sends_the_prompt_and_closes_the_client(real_transcriber):
    fake = FakeOpenAI()
    client, made = real_transcriber(fake)
    response = post(client)
    assert response.json() == {"success": True, "data": {"text": "מדף נוסף בתא השמאלי"}}
    assert made == [{"api_key": KEY, "timeout": 30.0, "max_retries": 1}]
    assert fake.created == [{"model": "gpt-transcribe", "file": ("voice.webm", WEBM, "audio/webm"), "prompt": PROMPT}]
    assert "language" not in fake.created[0] and "languages" not in fake.created[0]  # never forced
    assert fake.closed
    assert post(client).status_code == 200
    assert fake.listed == 1  # the pick is cached per key
    assert KEY not in repr(agent_transcribe._cache)  # by fingerprint, never the key itself


def test_real_transcribe_uses_the_configured_model_without_listing(real_transcriber, monkeypatch):
    monkeypatch.setattr(get_settings(), "openai_transcribe_model", "whisper-1")
    fake = FakeOpenAI(models=())
    client, _ = real_transcriber(fake)
    assert post(client).status_code == 200
    assert fake.listed == 0 and fake.created[0]["model"] == "whisper-1"


def test_silence_comes_back_as_empty_text(real_transcriber):
    client, _ = real_transcriber(FakeOpenAI(text="   "))
    assert post(client).json() == {"success": True, "data": {"text": ""}}


def test_pick_transcribe_model_prefers_current_models_then_falls_back():
    assert pick_transcribe_model(["whisper-1", "gpt-4o-transcribe", "gpt-transcribe", "gpt-5.4-mini"]) == "gpt-transcribe"
    assert pick_transcribe_model(["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"]) == "gpt-4o-mini-transcribe"
    assert pick_transcribe_model(["whisper-1", "gpt-5.4-mini"]) == "whisper-1"
    assert pick_transcribe_model(["gpt-9-transcribe", "gpt-10-transcribe", "gpt-11-transcribe-2027-01-01",
                                  "gpt-12-transcribe-diarize", "gpt-12-realtime-transcribe"]) == "gpt-10-transcribe"
    assert pick_transcribe_model(["gpt-4o-transcribe-diarize", "gpt-5.4-mini", "tts-1"]) is None


# --- validation: every code, before OpenAI is called ----------------------------------------------


@pytest.mark.parametrize(("kwargs", "status", "code"), [
    ({"key": "nope"}, 400, "INVALID_FORMAT"),
    ({"key": None}, 400, "INVALID_FORMAT"),
    ({"key": "   "}, 400, "INVALID_FORMAT"),
    ({"key": KEY + "!"}, 400, "INVALID_FORMAT"),
    ({"audio": None}, 400, "EMPTY_AUDIO"),
    ({"audio": b""}, 400, "EMPTY_AUDIO"),
    ({"audio": WEBM[:4] + b"\x00" * MAX_AUDIO_BYTES}, 413, "PAYLOAD_TOO_LARGE"),
    ({"content_type": "video/webm"}, 415, "UNSUPPORTED_MEDIA"),
    ({"content_type": "text/plain"}, 415, "UNSUPPORTED_MEDIA"),
    ({"content_type": "application/octet-stream"}, 415, "UNSUPPORTED_MEDIA"),
    ({"content_type": "audio/flac"}, 415, "UNSUPPORTED_MEDIA"),
    # Magic bytes that contradict the declared type.
    ({"audio": OGG}, 415, "UNSUPPORTED_MEDIA"),
    ({"audio": WEBM, "content_type": "audio/ogg"}, 415, "UNSUPPORTED_MEDIA"),
    ({"audio": b"RIFF\x24\x00\x00\x00AVI LIST" + MARKER, "content_type": "audio/wav"}, 415, "UNSUPPORTED_MEDIA"),
    ({"audio": b"<!doctype html><script>alert(1)</script>", "content_type": "audio/mpeg"}, 415, "UNSUPPORTED_MEDIA"),
    ({"audio": b"\x89PNG\r\n\x1a\n" + MARKER, "content_type": "audio/mp4"}, 415, "UNSUPPORTED_MEDIA"),
    ({"audio": b"\x1a"}, 415, "UNSUPPORTED_MEDIA"),
])
def test_bad_input_is_refused_with_our_code_before_calling_openai(api, kwargs, status, code):
    client, calls = api(lambda *args: pytest.fail("the transcriber must not run"))
    response = post(client, **kwargs)
    assert response.status_code == status
    assert response.json() == {"success": False, "data": None, "error": {"code": code, "message": response.json()["error"]["message"]}}
    assert KEY not in response.text
    assert calls == []


def test_a_json_body_is_not_a_form_and_gets_invalid_format(api):
    client, calls = api(lambda *args: pytest.fail("the transcriber must not run"))
    response = client.post("/api/voice/transcribe", json={"apiKey": KEY, "audio": "AAAA"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_FORMAT"
    assert KEY not in response.text and calls == []


def test_audio_sent_as_a_text_field_is_refused_without_echoing_the_key(api):
    client, calls = api(lambda *args: pytest.fail("the transcriber must not run"))
    response = client.post("/api/voice/transcribe", data={"apiKey": KEY, "audio": "not a file"})
    assert response.status_code in (400, 422)
    assert KEY not in response.text and calls == []


def test_sniff_audio_recognises_each_container():
    assert [sniff_audio(b) for b in (WEBM, OGG, MP4, MP3_ID3, MP3_FRAME, WAV)] == ["webm", "ogg", "mp4", "mp3", "mp3", "wav"]
    assert sniff_audio(b"") is None and sniff_audio(b"\xff") is None and sniff_audio(b"GIF89a") is None


# --- OpenAI errors: our codes, and the key never leaks ---------------------------------------------


def _status_error(cls, status, message):
    request = httpx2.Request("POST", "https://api.openai.com/v1/audio/transcriptions")
    body = {"message": message, "type": "invalid_request_error", "code": None, "param": None}
    return cls(message, response=httpx2.Response(status, request=request), body=body)


LEAKY = f"Incorrect API key provided: {KEY}. You can find your API key at https://platform.openai.com."


@pytest.mark.parametrize(("error", "status", "code"), [
    (_status_error(openai.AuthenticationError, 401, LEAKY), 401, "INVALID_KEY"),
    (_status_error(openai.PermissionDeniedError, 403, LEAKY), 401, "INVALID_KEY"),
    (_status_error(openai.NotFoundError, 404, LEAKY), 400, "MODEL_UNAVAILABLE"),
    (_status_error(openai.RateLimitError, 429, LEAKY), 429, "OPENAI_RATE_LIMIT"),
    (_status_error(openai.InternalServerError, 500, LEAKY), 502, "UPSTREAM"),
    (_status_error(openai.BadRequestError, 400, "Audio file might be corrupted or unsupported"), 502, "UPSTREAM"),
    (openai.APIConnectionError(request=httpx2.Request("POST", "https://api.openai.com/v1/audio/transcriptions")), 502, "UPSTREAM"),
])
def test_openai_errors_map_to_our_codes_and_never_echo_the_key_or_audio(real_transcriber, caplog, error, status, code):
    caplog.set_level(logging.DEBUG)
    fake = FakeOpenAI(error=error)
    client, _ = real_transcriber(fake)
    response = post(client)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "Incorrect API key" not in response.text
    for text in (response.text, caplog.text):
        assert KEY not in text
        assert KEY[8:24] not in text  # not even a fragment
        assert MARKER.decode() not in text
    assert f"Transcription failed: {type(error).__name__}" in caplog.text  # logged, key-free
    assert fake.closed


def test_a_key_without_a_transcription_model_gets_model_unavailable(real_transcriber):
    fake = FakeOpenAI(models=("gpt-5.4-mini", "tts-1"))
    client, _ = real_transcriber(fake)
    response = post(client)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MODEL_UNAVAILABLE"
    assert fake.created == [] and fake.closed


def test_success_logs_nothing_about_the_key_or_audio(real_transcriber, caplog):
    caplog.set_level(logging.DEBUG)
    client, _ = real_transcriber(FakeOpenAI())
    assert post(client).status_code == 200
    assert KEY not in caplog.text and MARKER.decode() not in caplog.text


# --- DoS limits: the concurrency slots ------------------------------------------------------------


def test_at_most_two_transcriptions_run_at_once(api):
    entered, release = threading.Semaphore(0), threading.Event()

    def slow(*args):
        entered.release()
        if not release.wait(10):
            raise RuntimeError("never released")
        return "ok"

    client, calls = api(slow)
    statuses = []
    workers = [threading.Thread(target=lambda: statuses.append(post(client).status_code)) for _ in range(2)]
    for worker in workers:
        worker.start()
    try:
        assert entered.acquire(timeout=10) and entered.acquire(timeout=10)
        started = time.monotonic()
        busy = post(client)
        waited = time.monotonic() - started
    finally:
        release.set()
        for worker in workers:
            worker.join(10)
    assert busy.status_code == 429
    assert busy.json()["error"]["code"] == "BUSY"
    assert waited < 1  # answered at once instead of holding a worker thread
    assert sorted(statuses) == [200, 200]
    assert len(calls) == 2


def test_a_slot_is_released_after_success_and_after_an_error(real_transcriber, monkeypatch):
    monkeypatch.setattr(voice, "_slots", threading.BoundedSemaphore(1))
    failing, _ = real_transcriber(FakeOpenAI(error=_status_error(openai.RateLimitError, 429, "slow down")))
    assert post(failing).status_code == 429
    working, _ = real_transcriber(FakeOpenAI())
    assert [post(working).status_code for _ in range(3)] == [200, 200, 200]


# --- DoS limits: the body cap is raised for this route only ---------------------------------------


def test_the_voice_cap_is_just_above_the_largest_audio_and_other_caps_are_unchanged():
    assert ROUTE_LIMITS == {("POST", "/api/dossier"): DOSSIER_MAX_BODY_BYTES, ("POST", "/api/voice/transcribe"): VOICE_MAX_BODY_BYTES}
    assert MAX_AUDIO_BYTES < VOICE_MAX_BODY_BYTES <= MAX_AUDIO_BYTES + 16 * 1024
    assert MAX_BODY_BYTES == 1024 * 1024


def test_the_largest_valid_request_fits_under_the_voice_cap(api):
    client, calls = api()
    longest_key = "sk-" + "a" * 500
    response = post(client, audio=WEBM[:4] + b"\x00" * (MAX_AUDIO_BYTES - 4), key=longest_key)
    assert response.status_code == 200
    assert len(calls[0][1]) == MAX_AUDIO_BYTES


def test_a_body_over_the_voice_cap_is_refused_before_the_endpoint_runs(api):
    client, calls = api(lambda *args: pytest.fail("the transcriber must not run"))
    origin = get_settings().cors_origin_list[0]
    response = post(client, audio=WEBM[:4] + b"\x00" * VOICE_MAX_BODY_BYTES, headers={"Origin": origin})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert response.headers["access-control-allow-origin"] == origin
    assert KEY not in response.text and calls == []


def _status_for(method, path, size):
    """Drives the real middleware with a `size`-byte body; returns the status the client got."""
    sent = []

    async def inner(scope, receive, send):
        await receive()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"x" * size, "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": method, "path": path, "headers": [(b"content-length", str(size).encode())]}
    asyncio.run(BodySizeLimitMiddleware(inner)(scope, receive, send))
    return sent[0]["status"]


@pytest.mark.parametrize(("method", "path", "status"), [
    ("POST", "/api/voice/transcribe", 200),
    ("PUT", "/api/voice/transcribe", 413),
    ("POST", "/api/voice/transcribe/", 413),
    ("POST", "/api/chat", 413),
    ("POST", "/api/settings/ai/verify", 413),
    ("POST", "/api/advisories", 413),
])
def test_only_post_to_the_voice_route_gets_the_raised_cap(method, path, status):
    assert _status_for(method, path, MAX_BODY_BYTES + 1024) == status
    assert _status_for("POST", "/api/voice/transcribe", VOICE_MAX_BODY_BYTES + 1) == 413


def test_audio_sent_as_text_or_a_key_sent_as_a_file_never_echoes_anything(api):
    """Security review 2026-10-17, LOW #1: FastAPI's own 422 echoed the submitted values."""
    client, calls = api(lambda *args: pytest.fail("the transcriber must not run"))
    as_form = client.post("/api/voice/transcribe", data={"apiKey": KEY, "audio": KEY})
    as_urlencoded = client.post("/api/voice/transcribe", content=f"apiKey={KEY}&audio={KEY}",
                                headers={"Content-Type": "application/x-www-form-urlencoded"})
    key_as_file = client.post("/api/voice/transcribe", files={"apiKey": ("k", KEY.encode(), "text/plain"), "audio": ("blob", WEBM, "audio/webm")})
    for response in (as_form, as_urlencoded, key_as_file):
        assert response.status_code in (400, 422)
        assert response.json()["success"] is False
        assert KEY not in response.text and "_TemporaryFileArgs" not in response.text and "_max_size" not in response.text
    assert calls == []
