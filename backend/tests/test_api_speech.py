"""POST /api/voice/speak (ADR-028): validation, the OpenAI call against a fake client, the persona,
the DoS slots, and that neither the key nor the text reaches a response or the log. Also the chat's
spoken mode, which asks the agent to answer for the ear."""

import logging
import threading
import time
from functools import partial
from types import SimpleNamespace as NS

import httpx2
import openai
import pytest
from fastapi.testclient import TestClient

from app.agent import chat as agent_chat
from app.agent import speech as agent_speech
from app.agent.chat import run_chat
from app.agent.prompts import SPOKEN_NOTE
from app.agent.speech import DEFAULT_VOICE, INSTRUCTIONS, MAX_SPOKEN_CHARS, VOICES, pick_speech_model, speak, spoken_text
from app.api import voice
from app.api.chat import get_chat_runner
from app.api.voice import MAX_SPEAK_INPUT, get_speaker
from app.config import get_settings
from app.main import app

KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ"
MP3 = b"ID3\x04\x00\x00" + b"\x00" * 300
SECRET_TEXT = "הטקסט-הסודי-של-הלקוח"


def post(client, text="שלום, אני בנאי.", key=KEY, voice_name=None):
    body = {"apiKey": key, "text": text}
    if voice_name is not None:
        body["voice"] = voice_name
    return client.post("/api/voice/speak", json=body)


@pytest.fixture
def api():
    """The endpoint with `runner` in place of speak(); returns (client, the calls it received)."""
    calls = []

    def use(runner=lambda *args: MP3):
        def recording(*args):
            calls.append(args)
            return runner(*args)

        app.dependency_overrides[get_speaker] = lambda: recording
        return TestClient(app), calls

    yield use
    app.dependency_overrides.clear()


class FakeOpenAI:
    def __init__(self, models=("gpt-4o-mini-tts", "tts-1", "gpt-5.4-mini"), audio=MP3, error=None):
        self._models, self._audio, self._error = models, audio, error
        self.listed, self.created, self.closed = 0, [], False
        self.models = NS(list=self._list)
        self.audio = NS(speech=NS(create=self._create))

    def _list(self):
        self.listed += 1
        return [NS(id=model_id) for model_id in self._models]

    def _create(self, **kwargs):
        self.created.append(kwargs)
        if self._error:
            raise self._error
        return NS(content=self._audio)

    def close(self):
        self.closed = True


@pytest.fixture
def real_speaker():
    """The endpoint with the real speak() talking to `fake`; returns (client, the factory's kwargs)."""
    agent_speech._cache.clear()

    def use(fake):
        made = []

        def factory(**kwargs):
            made.append(kwargs)
            return fake

        app.dependency_overrides[get_speaker] = lambda: partial(speak, client_factory=factory)
        return TestClient(app), made

    yield use
    app.dependency_overrides.clear()
    agent_speech._cache.clear()


# --- success ---------------------------------------------------------------------------------------


def test_returns_mp3_that_the_browser_must_not_cache(api):
    client, calls = api()
    response = post(client, text="שלום, אני בנאי.")
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["cache-control"] == "no-store"
    assert response.content == MP3
    assert calls == [(KEY, "שלום, אני בנאי.", DEFAULT_VOICE, None)]


def test_the_chosen_voice_and_the_configured_ones_are_used(api, monkeypatch):
    client, calls = api()
    assert post(client, voice_name="marin").status_code == 200
    assert calls[-1][2] == "marin"
    monkeypatch.setattr(get_settings(), "openai_tts_voice", "verse")
    monkeypatch.setattr(get_settings(), "openai_tts_model", "my-tts")
    assert post(client).status_code == 200
    assert calls[-1][2:] == ("verse", "my-tts")
    monkeypatch.setattr(get_settings(), "openai_tts_voice", "not-a-voice")  # a bad setting falls back
    assert post(client).status_code == 200
    assert calls[-1][2] == DEFAULT_VOICE


def test_real_speak_sends_the_persona_and_closes_the_client(real_speaker):
    fake = FakeOpenAI()
    client, made = real_speaker(fake)
    response = post(client, text="**היי!** בוא נתכנן.")
    assert response.status_code == 200 and response.content == MP3
    assert made == [{"api_key": KEY, "timeout": 30.0, "max_retries": 1}]
    assert fake.created == [{"model": "gpt-4o-mini-tts", "voice": DEFAULT_VOICE, "input": "היי! בוא נתכנן.",
                             "response_format": "mp3", "instructions": INSTRUCTIONS}]
    assert "smile" in INSTRUCTIONS and "Never pushy" in INSTRUCTIONS
    assert fake.closed
    assert post(client).status_code == 200
    assert fake.listed == 1  # the model pick is cached per key, by fingerprint
    assert KEY not in repr(agent_speech._cache)


def test_tts_1_gets_no_instructions_and_a_voice_it_supports(real_speaker):
    fake = FakeOpenAI(models=("tts-1", "whisper-1"))
    client, _ = real_speaker(fake)
    assert post(client, voice_name="marin").status_code == 200
    assert fake.created[0]["model"] == "tts-1"
    assert "instructions" not in fake.created[0]
    assert fake.created[0]["voice"] == "ash"


def test_pick_speech_model_prefers_current_models():
    assert pick_speech_model(["tts-1", "gpt-4o-mini-tts", "tts-1-hd"]) == "gpt-4o-mini-tts"
    assert pick_speech_model(["tts-1", "whisper-1"]) == "tts-1"
    assert pick_speech_model(["gpt-9-tts", "gpt-10-tts", "gpt-11-tts-2027-01-01", "gpt-realtime-tts"]) == "gpt-10-tts"
    assert pick_speech_model(["gpt-5.4-mini", "whisper-1"]) is None


def test_a_key_without_a_speech_model_gets_model_unavailable(real_speaker):
    fake = FakeOpenAI(models=("gpt-5.4-mini",))
    client, _ = real_speaker(fake)
    response = post(client)
    assert response.status_code == 400 and response.json()["error"]["code"] == "MODEL_UNAVAILABLE"
    assert fake.created == [] and fake.closed


# --- the text that is spoken ------------------------------------------------------------------------


def test_spoken_text_drops_markup_and_controls_and_collapses_lines():
    assert spoken_text("**שלום!** הנה:\n- רוחב 240\n- `ops` #1") == "שלום! הנה: - רוחב 240 - ops 1"
    # A lone surrogate never gets here: the JSON parser refuses it with a 422.
    assert spoken_text("\u202eבדיקה\x07 \u2066עוד\u2069") == "בדיקה עוד"
    assert spoken_text("   ") == ""


def test_a_long_reply_is_cut_after_the_last_full_sentence():
    sentence = "זה משפט שלם וקצר. "
    text = spoken_text(sentence * 200)
    assert len(text) <= MAX_SPOKEN_CHARS
    assert text.endswith("קצר.")
    no_stops = spoken_text("מילה " * 500)
    assert len(no_stops) <= MAX_SPOKEN_CHARS and no_stops.endswith("מילה")


def test_the_cut_text_is_what_reaches_the_speaker(api):
    client, calls = api()
    assert post(client, text="שלום. " * 600).status_code == 200
    assert len(calls[0][1]) <= MAX_SPOKEN_CHARS


# --- validation: every code, before OpenAI is called ------------------------------------------------


@pytest.mark.parametrize(("kwargs", "status", "code"), [
    ({"key": "nope"}, 400, "INVALID_FORMAT"),
    ({"key": "   "}, 400, "INVALID_FORMAT"),
    ({"text": ""}, 400, "EMPTY_TEXT"),
    ({"text": "*** `` ##"}, 400, "EMPTY_TEXT"),
    ({"text": "א" * (MAX_SPEAK_INPUT + 1)}, 422, "INVALID_REQUEST"),
    ({"voice_name": "robot"}, 422, "INVALID_REQUEST"),
    ({"key": KEY + "x" * 600}, 422, "INVALID_REQUEST"),
])
def test_bad_input_is_refused_with_our_code_and_echoes_nothing(api, kwargs, status, code):
    client, calls = api(lambda *args: pytest.fail("the speaker must not run"))
    response = post(client, **kwargs)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert KEY not in response.text and "robot" not in response.text
    assert calls == []


def test_every_listed_voice_is_accepted(api):
    client, calls = api()
    for name in VOICES:
        assert post(client, voice_name=name).status_code == 200
    assert [call[2] for call in calls] == list(VOICES)


# --- OpenAI errors: our codes, and neither the key nor the text leaks --------------------------------


def _status_error(cls, status, message):
    request = httpx2.Request("POST", "https://api.openai.com/v1/audio/speech")
    return cls(message, response=httpx2.Response(status, request=request), body={"message": message})


LEAKY = f"Incorrect API key provided: {KEY}."


@pytest.mark.parametrize(("error", "status", "code"), [
    (_status_error(openai.AuthenticationError, 401, LEAKY), 401, "INVALID_KEY"),
    (_status_error(openai.NotFoundError, 404, LEAKY), 400, "MODEL_UNAVAILABLE"),
    (_status_error(openai.RateLimitError, 429, LEAKY), 429, "OPENAI_RATE_LIMIT"),
    (_status_error(openai.InternalServerError, 500, LEAKY), 502, "UPSTREAM"),
    (openai.APIConnectionError(request=httpx2.Request("POST", "https://api.openai.com/v1/audio/speech")), 502, "UPSTREAM"),
])
def test_openai_errors_map_to_our_codes_and_leak_nothing(real_speaker, caplog, error, status, code):
    caplog.set_level(logging.DEBUG)
    fake = FakeOpenAI(error=error)
    client, _ = real_speaker(fake)
    response = post(client, text=SECRET_TEXT)
    assert response.status_code == status and response.json()["error"]["code"] == code
    for text in (response.text, caplog.text):
        assert KEY not in text and KEY[8:24] not in text and SECRET_TEXT not in text
    assert f"Speech failed: {type(error).__name__}" in caplog.text
    assert fake.closed


def test_empty_audio_from_openai_is_an_upstream_error(real_speaker):
    client, _ = real_speaker(FakeOpenAI(audio=b""))
    response = post(client)
    assert response.status_code == 502 and response.json()["error"]["code"] == "UPSTREAM"


# --- DoS: two at a time, answered at once when busy ---------------------------------------------------


def test_at_most_two_speeches_run_at_once(api):
    entered, release = threading.Semaphore(0), threading.Event()

    def slow(*args):
        entered.release()
        if not release.wait(10):
            raise RuntimeError("never released")
        return MP3

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
    assert busy.status_code == 429 and busy.json()["error"]["code"] == "BUSY"
    assert waited < 1
    assert sorted(statuses) == [200, 200]


def test_a_slot_is_released_after_an_error(real_speaker, monkeypatch):
    monkeypatch.setattr(voice, "_speak_slots", threading.BoundedSemaphore(1))
    failing, _ = real_speaker(FakeOpenAI(error=_status_error(openai.RateLimitError, 429, "slow down")))
    assert post(failing).status_code == 429
    working, _ = real_speaker(FakeOpenAI())
    assert [post(working).status_code for _ in range(2)] == [200, 200]


# --- the chat's spoken mode -----------------------------------------------------------------------


def test_the_chat_passes_spoken_only_when_set():
    received = []
    app.dependency_overrides[get_chat_runner] = lambda: lambda *args, **kwargs: received.append(kwargs) or agent_chat.ChatResult("בסדר", "m")
    try:
        client = TestClient(app)
        messages = [{"role": "user", "content": "שלום"}]
        assert client.post("/api/chat", json={"apiKey": KEY, "messages": messages}).status_code == 200
        assert client.post("/api/chat", json={"apiKey": KEY, "messages": messages, "spoken": True}).status_code == 200
    finally:
        app.dependency_overrides.clear()
    assert received == [{}, {"spoken": True}]


def test_a_spoken_turn_tells_the_model_to_answer_for_the_ear(monkeypatch):
    seen = {}

    def fake_run(client, model, messages, context=None, propose=None, **kwargs):
        seen["context"] = context
        return "שלום"

    class Client:
        models = NS(list=lambda: [NS(id="gpt-5.4-mini")])

        def close(self):
            pass

    monkeypatch.setattr(agent_chat, "run_chat", fake_run)
    agent_chat.answer(KEY, [{"role": "user", "content": "x"}], "m", client_factory=lambda **kwargs: Client(), spoken=True)
    assert seen["context"] == SPOKEN_NOTE
    agent_chat.answer(KEY, [{"role": "user", "content": "x"}], "m", client_factory=lambda **kwargs: Client())
    assert seen["context"] is None
    assert "three short sentences" in SPOKEN_NOTE and "סנטימטר" in SPOKEN_NOTE
    assert run_chat  # the real one stays importable


# --- security review 2026-10-17 (ADR-028) ----------------------------------------------------------


def test_a_400_from_openai_never_puts_its_message_in_the_log(real_speaker, caplog):
    """LOW-3: a 400 might quote the reply text, so speech logs only code, type and param."""
    caplog.set_level(logging.DEBUG)
    error = _status_error(openai.BadRequestError, 400, f"Invalid input: {SECRET_TEXT}")
    client, _ = real_speaker(FakeOpenAI(error=error))
    assert post(client, text=SECRET_TEXT).status_code == 502
    assert "Speech failed: BadRequestError" in caplog.text and SECRET_TEXT not in caplog.text


def test_oversized_audio_from_openai_is_refused(real_speaker):
    client, _ = real_speaker(FakeOpenAI(audio=b"\x00" * (agent_speech.MAX_AUDIO_BYTES + 1)))
    response = post(client)
    assert response.status_code == 502 and response.json()["error"]["code"] == "UPSTREAM"


def test_invisible_direction_and_separator_characters_are_dropped():
    assert spoken_text("שלום\u200f\u2028עולם\u061c\ufeff!") == "שלום עולם !"
