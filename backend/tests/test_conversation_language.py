"""The session language (ADR-029): the agent answers in it, and transcription is told it."""

from functools import partial
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app.agent import chat as agent_chat
from app.agent import transcribe as agent_transcribe
from app.agent.prompts import SPOKEN_NOTE, language_note
from app.agent.transcribe import PROMPT, PROMPTS, transcribe
from app.api.chat import get_chat_runner
from app.api.voice import get_transcriber
from app.main import app

KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ"
WEBM = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01" + b"\x00" * 200
MESSAGES = [{"role": "user", "content": "hello"}]


def test_the_chat_passes_the_session_language_and_refuses_others():
    received = []
    app.dependency_overrides[get_chat_runner] = lambda: lambda *args, **kwargs: received.append(kwargs) or agent_chat.ChatResult("ok", "m")
    try:
        client = TestClient(app)
        for body in ({}, {"language": "ru"}, {"language": "ar", "spoken": True}):
            assert client.post("/api/chat", json={"apiKey": KEY, "messages": MESSAGES, **body}).status_code == 200
        refused = client.post("/api/chat", json={"apiKey": KEY, "messages": MESSAGES, "language": "fr"})
    finally:
        app.dependency_overrides.clear()
    assert received == [{}, {"language": "ru"}, {"spoken": True, "language": "ar"}]
    assert refused.status_code == 422 and "fr" not in refused.text


@pytest.mark.parametrize(("kwargs", "expected"), [
    ({}, None),
    ({"language": "en"}, language_note("en")),
    ({"language": "ar", "spoken": True}, f"{SPOKEN_NOTE}\n\n{language_note('ar')}"),
    ({"language": "xx"}, None),
])
def test_the_agent_is_told_the_session_language(monkeypatch, kwargs, expected):
    seen = {}

    def fake_run(client, model, messages, context=None, propose=None, **_):
        seen["context"] = context
        return "ok", []

    class Client:
        def close(self):
            pass

    monkeypatch.setattr(agent_chat, "run_chat", fake_run)
    agent_chat.answer(KEY, MESSAGES, "m", client_factory=lambda **_: Client(), **kwargs)
    assert seen["context"] == expected


def test_the_language_note_names_the_language_and_the_name_to_use():
    note = language_note("ru")
    assert "Russian" in note and "IDENTITY" in note


@pytest.fixture
def transcribe_calls():
    calls = []
    app.dependency_overrides[get_transcriber] = lambda: lambda *args, **kwargs: calls.append(kwargs) or "שלום"
    yield calls
    app.dependency_overrides.clear()


def post_audio(**data):
    return TestClient(app).post("/api/voice/transcribe", data={"apiKey": KEY, **data},
                                files={"audio": ("blob", WEBM, "audio/webm")})


def test_transcription_gets_a_valid_language_and_ignores_anything_else(transcribe_calls):
    assert post_audio(language="ru").status_code == 200
    assert post_audio(language="klingon").status_code == 200
    assert post_audio().status_code == 200
    assert transcribe_calls == [{"language": "ru"}, {}, {}]


def test_real_transcription_sends_the_language_and_its_own_vocabulary():
    created = []
    fake = NS(models=NS(list=lambda: [NS(id="gpt-transcribe")]),
              audio=NS(transcriptions=NS(create=lambda **kw: created.append(kw) or NS(text="hello"))),
              close=lambda: None)
    agent_transcribe._cache.clear()
    run = partial(transcribe, client_factory=lambda **_: fake)
    assert run(KEY, WEBM, "voice.webm", "audio/webm", None, language="ar") == "hello"
    assert created[-1]["language"] == "ar" and created[-1]["prompt"] == PROMPTS["ar"]
    run(KEY, WEBM, "voice.webm", "audio/webm", None)
    assert "language" not in created[-1] and created[-1]["prompt"] == PROMPT  # no language: never forced
    assert set(PROMPTS) == {"he", "en", "ru", "ar"}
    agent_transcribe._cache.clear()
