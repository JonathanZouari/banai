"""/api/voice/transcribe and /api/voice/speak with a scripted OpenAI client."""

import openai
import pytest
from fastapi.testclient import TestClient

from app.api.chat import get_agent_client
from app.api.limits import limiter
from app.config import Settings, get_settings
from app.main import app
from tests.agent.fakes import FakeOpenAI

SETTINGS = Settings(
    openai_api_key="test", openai_chat_model="m", proposal_signing_key="s" * 64,
    voice_rate_limit="1000/minute", chat_rate_limit="1000/minute",
)
AUDIO = b"\x1aE\xdf\xa3" + b"\x00" * 200  # not real audio: the fake client never decodes it
http = TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    limiter.reset()
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    yield
    app.dependency_overrides.clear()


def use_client(client):
    app.dependency_overrides[get_agent_client] = lambda: client
    return client


def transcribe(content=AUDIO, content_type="audio/webm;codecs=opus"):
    return http.post("/api/voice/transcribe", content=content, headers={"content-type": content_type})


def test_transcribe_returns_the_text_and_sends_the_audio_to_the_configured_model():
    client = use_client(FakeOpenAI(transcript="  add a shelf please  "))
    response = transcribe()
    assert response.status_code == 200 and response.json() == {"success": True, "data": {"text": "add a shelf please"}}
    call = client.audio_requests[0]
    assert call["model"] == "gpt-transcribe"
    assert call["file"] == ("voice.webm", AUDIO, "audio/webm")


@pytest.mark.parametrize("content_type", ["audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/mpeg", "audio/wav", "AUDIO/WEBM"])
def test_transcribe_accepts_the_browser_audio_formats(content_type):
    use_client(FakeOpenAI())
    assert transcribe(content_type=content_type).status_code == 200


@pytest.mark.parametrize("content_type", ["application/json", "text/plain", "video/webm", "", "audio/flac"])
def test_transcribe_rejects_other_content_types_before_calling_openai(content_type):
    client = use_client(FakeOpenAI())
    response = transcribe(content_type=content_type)
    assert response.status_code == 415 and response.json()["error"]["code"] == "UNSUPPORTED_AUDIO"
    assert client.audio_requests == []


def test_transcribe_rejects_empty_and_oversized_recordings():
    client = use_client(FakeOpenAI())
    assert transcribe(content=b"").status_code == 422
    assert transcribe(content=b"\x00" * 1_000_001).status_code == 413
    assert client.audio_requests == []


def test_the_audio_cap_is_separate_from_the_json_cap():
    use_client(FakeOpenAI())
    assert transcribe(content=b"\x00" * 600_000).status_code == 200  # above the 256 KB JSON cap
    big_json = http.post("/api/chat", content=b"x" * 300_000, headers={"content-type": "application/json"})
    assert big_json.status_code == 413


def test_silence_gives_a_friendly_422():
    use_client(FakeOpenAI(transcript="   "))
    response = transcribe()
    assert response.status_code == 422 and response.json()["error"]["code"] == "NO_SPEECH"


def test_long_transcripts_are_cut_to_the_chat_limit():
    use_client(FakeOpenAI(transcript="x" * 5000))
    assert len(transcribe().json()["data"]["text"]) == 2000


def test_openai_failures_are_generic_and_never_leak_details():
    class Boom:
        class audio:  # noqa: N801
            class transcriptions:  # noqa: N801
                @staticmethod
                def create(**_):
                    raise openai.APIConnectionError(request=None)

            class speech:  # noqa: N801
                @staticmethod
                def create(**_):
                    raise openai.APIConnectionError(request=None)

    use_client(Boom)
    for response in (transcribe(), http.post("/api/voice/speak", json={"text": "hi"})):
        assert response.status_code == 502 and response.json()["error"]["code"] == "VOICE_ERROR"
        assert "test" not in response.text.lower()


def test_voice_is_unavailable_without_a_key():
    app.dependency_overrides[get_agent_client] = lambda: None
    assert transcribe().status_code == 503
    assert http.post("/api/voice/speak", json={"text": "hi"}).status_code == 503


def test_speak_returns_mp3_audio_with_the_configured_model_and_voice():
    client = use_client(FakeOpenAI(speech=b"ID3abc"))
    response = http.post("/api/voice/speak", json={"text": "Here is what I would change."})
    assert response.status_code == 200 and response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"ID3abc" and response.headers["cache-control"] == "no-store"
    call = client.audio_requests[0]
    assert (call["model"], call["voice"], call["response_format"]) == ("gpt-4o-mini-tts", "alloy", "mp3")
    assert call["input"] == "Here is what I would change."


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "x" * 601}, {"text": "hi", "voice": "x"}, {"text": 5}])
def test_speak_validates_its_input(payload):
    client = use_client(FakeOpenAI())
    assert http.post("/api/voice/speak", json=payload).status_code == 422
    assert client.audio_requests == []


def test_voice_endpoints_are_rate_limited():
    from app.api import voice as voice_module

    original = voice_module.get_settings
    voice_module.get_settings = lambda: Settings(voice_rate_limit="2/minute")
    try:
        app.dependency_overrides[get_agent_client] = lambda: None
        codes = [transcribe().status_code for _ in range(4)]
    finally:
        voice_module.get_settings = original
    assert codes == [503, 503, 429, 429]


def test_a_transcript_goes_through_the_normal_chat_so_scope_and_confirm_still_apply():
    from app.domain.defaults import basic_wardrobe
    from tests.agent.fakes import reply

    use_client(FakeOpenAI(reply("I can only help with designing the wardrobe.")))
    body = {"messages": [{"role": "user", "content": "recipe for cake"}], "design": basic_wardrobe(), "revision": 1}
    data = http.post("/api/chat", json=body).json()["data"]
    assert data["proposal"] is None  # a voice message cannot apply anything by itself


def test_blank_speech_is_rejected_and_not_billed():
    client = use_client(FakeOpenAI())
    assert http.post("/api/voice/speak", json={"text": "   \n "}).status_code == 422
    assert client.audio_requests == []
    http.post("/api/voice/speak", json={"text": "  hi  "})
    assert client.audio_requests[0]["input"] == "hi"


def test_unexpected_server_errors_use_the_envelope_without_details():
    class Broken:
        class audio:  # noqa: N801
            class transcriptions:  # noqa: N801
                @staticmethod
                def create(**_):
                    raise ZeroDivisionError("secret internals")

    use_client(Broken)
    safe = TestClient(app, raise_server_exceptions=False)
    response = safe.post("/api/voice/transcribe", content=AUDIO, headers={"content-type": "audio/webm"})
    assert response.status_code == 500 and response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "secret" not in response.text
