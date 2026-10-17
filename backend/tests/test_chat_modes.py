"""Phase 6: guided / free chat modes and the agent seeing the latest (manually edited) design."""

import copy

import pytest
from fastapi.testclient import TestClient

from app.api.chat import get_agent_client
from app.api.limits import limiter
from app.config import Settings, get_settings
from app.domain.defaults import basic_wardrobe
from app.main import app
from tests.agent.fakes import FakeOpenAI, reply

SETTINGS = Settings(openai_api_key="test", openai_chat_model="m", proposal_signing_key="s" * 64, chat_rate_limit="1000/minute")
http = TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    limiter.reset()
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    yield
    app.dependency_overrides.clear()


def ask(client, **extra):
    app.dependency_overrides[get_agent_client] = lambda: client
    body = {"messages": [{"role": "user", "content": "hi"}], "design": basic_wardrobe(), "revision": 1, **extra}
    return http.post("/api/chat", json=body)


def system_prompt(client):
    return client.requests[0]["messages"][0]["content"]


def test_guided_mode_adds_the_guided_rules():
    client = FakeOpenAI(reply("Hello."))
    assert ask(client, mode="guided").status_code == 200
    assert "GUIDED MODE" in system_prompt(client)


@pytest.mark.parametrize("extra", [{}, {"mode": "free"}])
def test_free_mode_is_the_default_and_has_no_guided_rules(extra):
    client = FakeOpenAI(reply("Hello."))
    assert ask(client, **extra).status_code == 200
    assert "GUIDED MODE" not in system_prompt(client)


def test_both_modes_tell_the_agent_how_to_treat_the_starter_and_manual_edits():
    for mode in ("free", "guided"):
        client = FakeOpenAI(reply("Hello."))
        ask(client, mode=mode)
        prompt = system_prompt(client)
        assert "create_wardrobe" in prompt and "Manual edits" in prompt


def test_an_unknown_mode_is_rejected_before_calling_openai():
    client = FakeOpenAI()
    assert ask(client, mode="hacker").status_code == 422
    assert client.requests == []


def test_the_agent_receives_the_latest_design_including_a_manual_edit():
    design = copy.deepcopy(basic_wardrobe())
    design["compartments"][0]["shelves"][0]["y"] = 777  # what a manual edit leaves behind
    client = FakeOpenAI(reply("Noted."))
    app.dependency_overrides[get_agent_client] = lambda: client
    body = {"messages": [{"role": "user", "content": "raise it"}], "design": design, "revision": 2}
    assert http.post("/api/chat", json=body).status_code == 200
    assert '"y":777' in system_prompt(client)
