from types import SimpleNamespace

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, RateLimitError

from app.api import voice
from app.api.chat import limiter
from app.config import Settings, get_settings
from app.main import app

KEY = "k" * 40
WEBM = b"\x1a\x45\xdf\xa3" + b"x" * 3000


def settings(**kw):
    base = dict(openai_api_key="sk-test", proposal_signing_key=KEY, voice_enabled=True, chat_rate_limit="1000/minute", voice_rate_limit="1000/minute")
    return Settings(_env_file=None, **{**base, **kw})


class FakeAudio:
    def __init__(self, text="make it 240 centimeters wide", audio=b"\x01\x02" * 5000, error=None):
        self.text, self.audio, self.error, self.calls = text, audio, error, []
        self.transcriptions = SimpleNamespace(create=self._stt)
        self.speech = SimpleNamespace(with_streaming_response=SimpleNamespace(create=self._tts))

    def _stt(self, **kw):
        self.calls.append(("stt", kw))
        if self.error:
            raise self.error
        return SimpleNamespace(text=self.text)

    def _tts(self, **kw):
        self.calls.append(("tts", kw))
        if self.error:
            raise self.error
        audio = self.audio

        class Stream:
            closed = False

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                Stream.closed = True

            def iter_bytes(self, size):
                for i in range(0, len(audio), size):
                    yield audio[i : i + size]

        self.stream_class = Stream
        return Stream()


@pytest.fixture
def make_client():
    limiter.reset()
    voice.reset_guards()

    def build(fake=None, cfg=None):
        cfg = cfg or settings()
        app.dependency_overrides[get_settings] = lambda: cfg
        if fake is not None:
            app.dependency_overrides[voice.get_voice_client] = lambda: fake
        return TestClient(app, raise_server_exceptions=False), cfg

    yield build
    app.dependency_overrides.clear()
    voice.reset_guards()


def post_audio(http, data=WEBM, ctype="audio/webm;codecs=opus", query=""):
    return http.post(f"/api/voice/transcribe{query}", content=data, headers={"Content-Type": ctype})


def test_status_reflects_the_switch(make_client):
    http, _ = make_client(cfg=settings(voice_enabled=False))
    assert http.get("/api/voice/status").json()["data"] == {"enabled": False, "maxSeconds": 20}
    http, _ = make_client(cfg=settings())
    assert http.get("/api/voice/status").json()["data"]["enabled"] is True


def test_disabled_voice_is_503_and_never_calls_openai(make_client):
    fake = FakeAudio()
    http, _ = make_client(fake, settings(voice_enabled=False))
    assert post_audio(http).json()["error"]["code"] == "VOICE_DISABLED"
    assert http.post("/api/voice/speak", json={"text": "hi"}).status_code == 503
    assert fake.calls == []


def test_transcribe_returns_clean_text_and_passes_language_and_model(make_client):
    fake = FakeAudio("  hello‮   wide\n world \x07 ")
    http, cfg = make_client(fake)
    data = post_audio(http, query="?language=he").json()["data"]
    assert data == {"text": "hello wide world", "noSpeech": False}
    kind, kw = fake.calls[0]
    assert kw["model"] == cfg.openai_stt_model and kw["language"] == "he" and kw["file"][0] == "voice.webm"


def test_transcript_is_clipped_to_the_chat_limit(make_client):
    http, _ = make_client(FakeAudio("a" * 5000))
    assert len(post_audio(http).json()["data"]["text"]) == 2000


def test_silence_and_taps_are_no_speech_not_errors(make_client):
    fake = FakeAudio("")
    http, _ = make_client(fake)
    assert post_audio(http).json()["data"] == {"text": "", "noSpeech": True}
    assert post_audio(http, data=WEBM[:100]).json()["data"]["noSpeech"] is True
    assert len(fake.calls) == 1  # the tap never reached OpenAI


@pytest.mark.parametrize(
    ("data", "ctype", "status"),
    [(WEBM, "text/plain", 415), (WEBM, "application/json", 415), (b"not audio at all" * 200, "audio/webm", 415), (b"MZ" + b"x" * 3000, "audio/wav", 415)],
)
def test_wrong_type_or_magic_bytes_rejected(make_client, data, ctype, status):
    fake = FakeAudio()
    http, _ = make_client(fake)
    assert post_audio(http, data, ctype).status_code == status
    assert fake.calls == []


def test_too_long_is_413_by_header_and_while_streaming(make_client):
    fake = FakeAudio()
    http, cfg = make_client(fake)
    big = b"\x1a\x45\xdf\xa3" + b"x" * (cfg.voice_max_audio_bytes + 10)
    assert post_audio(http, big).status_code == 413
    # chunked body: no Content-Length, so only the streaming cap can stop it
    def chunks():
        yield big[:300_000]
        yield big[300_000:]

    r = http.post("/api/voice/transcribe", content=chunks(), headers={"Content-Type": "audio/webm"})
    assert r.status_code == 413 and r.json()["error"]["code"] == "AUDIO_TOO_LONG"
    assert fake.calls == []


def test_bad_language_is_422(make_client):
    http, _ = make_client(FakeAudio())
    assert post_audio(http, query="?language=fr").status_code == 422


def test_missing_key_is_503(make_client):
    http, _ = make_client(FakeAudio(), settings(openai_api_key=None))
    assert post_audio(http).json()["error"]["code"] == "AGENT_NOT_CONFIGURED"


@pytest.mark.parametrize(("code", "status", "app_code"), [("insufficient_quota", 503, "VOICE_QUOTA"), ("rate_limit_exceeded", 429, "VOICE_BUSY")])
def test_openai_quota_and_rate_limit_are_distinct(make_client, code, status, app_code):
    response = httpx.Response(429, request=httpx.Request("POST", "https://x"))
    http, _ = make_client(FakeAudio(error=RateLimitError("limit", response=response, body={"code": code})))
    r = post_audio(http)
    assert (r.status_code, r.json()["error"]["code"]) == (status, app_code)


def test_openai_outage_is_502_without_details(make_client):
    http, _ = make_client(FakeAudio(error=APIConnectionError(request=httpx.Request("POST", "https://x"))))
    r = post_audio(http)
    assert r.status_code == 502 and "sk-test" not in r.text


def test_speak_streams_pcm_and_shortens_long_text(make_client):
    fake = FakeAudio()
    http, cfg = make_client(fake)
    r = http.post("/api/voice/speak", json={"text": "Done. " * 200})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/octet-stream")
    assert r.headers["x-audio-format"] == "pcm16;rate=24000;channels=1" and r.content == b"\x01\x02" * 5000
    kind, kw = fake.calls[0]
    assert kw["response_format"] == "pcm" and kw["model"] == cfg.openai_tts_model
    assert len(kw["input"]) <= cfg.voice_tts_max_chars and kw["input"].endswith(".")
    assert fake.stream_class.closed is True  # the OpenAI stream is always closed


def test_speak_errors_before_streaming_use_the_envelope(make_client):
    http, _ = make_client(FakeAudio(error=APIConnectionError(request=httpx.Request("POST", "https://x"))))
    r = http.post("/api/voice/speak", json={"text": "hello"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "VOICE_UNAVAILABLE"


def test_voice_client_is_reused_between_requests():
    voice._audio_client.cache_clear()
    a = voice._audio_client("sk-test", 30.0)
    assert voice._audio_client("sk-test", 30.0) is a


@pytest.mark.parametrize("payload", [{"text": ""}, {"text": "x" * 1501}, {"text": "hi", "extra": 1}, {}])
def test_speak_validates_input_without_echo(make_client, payload):
    fake = FakeAudio()
    http, _ = make_client(fake)
    r = http.post("/api/voice/speak", json=payload)
    assert r.status_code == 422 and "xxx" not in r.text and fake.calls == []


def test_shorten_for_speech_cuts_at_sentence_or_space():
    assert voice.shorten_for_speech("Short.", 400) == "Short."
    assert voice.shorten_for_speech("One two three. Four five six seven eight nine ten.", 30) == "One two three."
    assert voice.shorten_for_speech("word " * 100, 23).count(" ") <= 4


def test_per_ip_rate_limit(make_client, monkeypatch):
    cfg = settings(voice_rate_limit="2/minute")
    monkeypatch.setattr("app.api.voice.get_settings", lambda: cfg)
    http, _ = make_client(FakeAudio(), cfg)
    assert [post_audio(http).status_code for _ in range(3)] == [200, 200, 429]


def test_hourly_cap_and_daily_budget(make_client):
    http, _ = make_client(FakeAudio(), settings(voice_hourly_cap=2))
    assert [post_audio(http).status_code for _ in range(3)] == [200, 200, 429]
    voice.reset_guards()
    http, _ = make_client(FakeAudio(), settings(voice_daily_budget_usd=0.00001))
    r = post_audio(http)
    assert r.status_code == 429 and r.json()["error"]["code"] == "VOICE_BUDGET"


def test_budget_counts_both_directions_and_stops_openai_calls(make_client):
    fake = FakeAudio()
    http, _ = make_client(fake, settings(voice_daily_budget_usd=0.003))
    codes = [http.post("/api/voice/speak", json={"text": "x" * 400}).status_code for _ in range(5)]
    assert 429 in codes and codes.count(200) < 5 and len(fake.calls) == codes.count(200)


def test_audio_limit_does_not_loosen_json_routes(make_client):
    http, _ = make_client(FakeAudio())
    big = {"messages": [{"role": "user", "content": "x"}], "design": {"pad": "x" * 400_000}, "revision": 1}
    assert http.post("/api/chat", json=big).status_code == 413
