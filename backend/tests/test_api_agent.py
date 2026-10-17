"""/api/chat and /api/proposals/apply with a scripted OpenAI client: the whole confirm/cancel/stale protocol."""

import copy
from types import SimpleNamespace

import openai
import pytest
from fastapi.testclient import TestClient

from app.api.chat import get_agent_client
from app.api.limits import limiter
from app.config import Settings, get_settings
from app.domain.defaults import basic_wardrobe
from app.main import app
from tests.agent.fakes import FakeOpenAI, call, reply

KEY = "s" * 64
SETTINGS = Settings(openai_api_key="test", openai_chat_model="test-model", proposal_signing_key=KEY, chat_rate_limit="1000/minute")


@pytest.fixture(autouse=True)
def _reset():
    limiter.reset()
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    yield
    app.dependency_overrides.clear()


def use_client(client):
    app.dependency_overrides[get_agent_client] = lambda: client
    return client


http = TestClient(app)


def chat_body(text="add a shelf", design=None, revision=1, messages=None):
    return {
        "messages": messages or [{"role": "user", "content": text}],
        "design": design if design is not None else basic_wardrobe(),
        "revision": revision,
    }


def propose(revision=1, design=None):
    use_client(FakeOpenAI(reply("Sure.", [call("add_shelf", compartmentId="cmp_middle", y=500)])))
    response = http.post("/api/chat", json=chat_body(revision=revision, design=design))
    assert response.status_code == 200, response.text
    return response.json()["data"]["proposal"]


def apply_body(proposal, design=None, revision=1):
    return {"design": design if design is not None else basic_wardrobe(), "revision": revision, "proposal": proposal}


# ---- /api/chat -------------------------------------------------------------------------------

def test_chat_returns_a_signed_proposal_and_never_touches_the_design():
    design = basic_wardrobe()
    snapshot = copy.deepcopy(design)
    use_client(FakeOpenAI(reply("Sure.", [call("add_shelf", compartmentId="cmp_middle", y=500)])))
    response = http.post("/api/chat", json=chat_body(design=design))
    body = response.json()
    assert response.status_code == 200 and body["success"] is True
    proposal = body["data"]["proposal"]
    assert body["data"]["reply"] == "Sure."
    assert proposal["baseRevision"] == 1 and len(proposal["signature"]) == 64 and len(proposal["baseHash"]) == 64
    assert proposal["ops"][0]["id"].startswith("shf_")
    assert proposal["changes"] == [{"title": "Add shelf", "detail": "In compartment 2, 50 cm from the bottom."}]
    assert design == snapshot


def test_chat_question_has_no_proposal():
    use_client(FakeOpenAI(reply("Which compartment do you mean?")))
    data = http.post("/api/chat", json=chat_body()).json()["data"]
    assert data["reply"] == "Which compartment do you mean?" and data["proposal"] is None
    assert len(data["replySignature"]) == 64


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b.update(messages=[]),
        lambda b: b.update(messages=[{"role": "system", "content": "x"}]),
        lambda b: b.update(messages=[{"role": "user", "content": "x" * 2001}]),
        lambda b: b.update(messages=[{"role": "user", "content": "hi"}] * 31),
        lambda b: b.update(revision=0),
        lambda b: b.update(revision="1"),
        lambda b: b.update(extra=1),
        lambda b: b.update(design={"schemaVersion": 1}),
    ],
)
def test_chat_rejects_invalid_requests_before_calling_openai(mutate):
    client = use_client(FakeOpenAI())
    body = chat_body()
    mutate(body)
    response = http.post("/api/chat", json=body)
    assert response.status_code == 422 and response.json()["success"] is False
    assert client.requests == []


def test_chat_last_message_must_be_from_the_customer():
    client = use_client(FakeOpenAI())
    messages = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    assert http.post("/api/chat", json=chat_body(messages=messages)).status_code == 422
    assert client.requests == []


def test_chat_is_unavailable_without_a_key():
    app.dependency_overrides[get_agent_client] = lambda: None
    assert http.post("/api/chat", json=chat_body()).status_code == 503


def test_chat_uses_the_default_model_when_none_is_configured():
    client = use_client(FakeOpenAI(reply("Which compartment?")))
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="k", openai_chat_model="", proposal_signing_key=KEY)
    assert http.post("/api/chat", json=chat_body()).status_code == 200
    request = client.requests[0]
    assert request["model"] == "gpt-5.4-mini" and "temperature" not in request  # the fallback model may reject it


def test_chat_is_unavailable_without_a_signing_key():
    use_client(FakeOpenAI(reply("x", [call("add_shelf", compartmentId="cmp_middle", y=500)])))
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="k", openai_chat_model="m", proposal_signing_key="")
    assert http.post("/api/chat", json=chat_body()).status_code == 503


def test_openai_failures_become_a_generic_502_without_leaking_details():
    class Boom:
        class chat:  # noqa: N801
            class completions:  # noqa: N801
                @staticmethod
                def create(**_):
                    raise openai.APIConnectionError(request=None)

    use_client(Boom)
    response = http.post("/api/chat", json=chat_body())
    assert response.status_code == 502 and response.json()["error"]["code"] == "AGENT_ERROR"
    assert "test" not in response.text.lower().replace("test-model", "")


def test_chat_is_rate_limited():
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    from app.api import chat as chat_module

    original = chat_module.get_settings
    chat_module.get_settings = lambda: Settings(chat_rate_limit="3/minute")
    try:
        app.dependency_overrides[get_agent_client] = lambda: None
        codes = [http.post("/api/chat", json=chat_body()).status_code for _ in range(5)]
    finally:
        chat_module.get_settings = original
    assert codes[:3] == [503, 503, 503] and codes[3:] == [429, 429]


def test_oversized_bodies_are_refused():
    response = http.post("/api/chat", content=b"x" * 300_000, headers={"content-type": "application/json"})
    assert response.status_code == 413


# ---- /api/proposals/apply --------------------------------------------------------------------

def test_confirm_applies_the_proposal_and_bumps_the_revision():
    proposal = propose()
    response = http.post("/api/proposals/apply", json=apply_body(proposal))
    data = response.json()["data"]
    assert response.status_code == 200 and data["revision"] == 2
    shelf_ids = [s["id"] for s in data["design"]["compartments"][1]["shelves"]]
    assert proposal["ops"][0]["id"] in shelf_ids


def test_applying_twice_gives_the_same_result():
    proposal = propose()
    first = http.post("/api/proposals/apply", json=apply_body(proposal)).json()
    second = http.post("/api/proposals/apply", json=apply_body(proposal)).json()
    assert first == second


def test_stale_when_the_revision_moved():
    proposal = propose()
    response = http.post("/api/proposals/apply", json=apply_body(proposal, revision=2))
    assert response.status_code == 409 and response.json()["error"]["code"] == "STALE"


def test_stale_when_the_design_changed_at_the_same_revision():
    proposal = propose()
    edited = basic_wardrobe()
    edited["compartments"][0]["shelves"][0]["y"] = 410
    response = http.post("/api/proposals/apply", json=apply_body(proposal, design=edited))
    assert response.status_code == 409


def test_tampered_ops_are_rejected():
    proposal = propose()
    proposal["ops"][0]["y"] = 600
    response = http.post("/api/proposals/apply", json=apply_body(proposal))
    assert response.status_code == 403 and response.json()["error"]["code"] == "INVALID_SIGNATURE"


def test_forged_and_foreign_signatures_are_rejected():
    proposal = propose()
    assert http.post("/api/proposals/apply", json=apply_body({**proposal, "signature": "0" * 64})).status_code == 403
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="k", openai_chat_model="m", proposal_signing_key="z" * 64)
    assert http.post("/api/proposals/apply", json=apply_body(proposal)).status_code == 403


def test_a_proposal_cannot_be_rebased_onto_a_different_revision_or_hash():
    proposal = propose()
    assert http.post("/api/proposals/apply", json=apply_body({**proposal, "baseRevision": 2}, revision=2)).status_code == 403
    assert http.post("/api/proposals/apply", json=apply_body({**proposal, "baseHash": "a" * 64})).status_code == 403


@pytest.mark.parametrize("field", ["signature", "baseHash", "ops", "baseRevision"])
def test_apply_requires_every_signed_field(field):
    proposal = propose()
    del proposal[field]
    assert http.post("/api/proposals/apply", json=apply_body(proposal)).status_code == 422


def test_apply_is_unavailable_without_a_signing_key():
    proposal = propose()
    app.dependency_overrides[get_settings] = lambda: Settings(openai_api_key="k", openai_chat_model="m", proposal_signing_key="")
    assert http.post("/api/proposals/apply", json=apply_body(proposal)).status_code == 503


def test_cancel_is_client_only_there_is_no_server_state():
    proposal = propose()
    # The server stored nothing: an unrelated request leaves the design as it was and the proposal stays valid.
    assert http.get("/api/designs/default").json()["data"]["design"] == basic_wardrobe()
    assert http.post("/api/proposals/apply", json=apply_body(proposal)).status_code == 200


# ---- hardening from the Phase 5 security review ------------------------------------------------

def test_weak_signing_keys_are_refused_at_startup():
    with pytest.raises(ValueError, match="at least 32"):
        Settings(proposal_signing_key="changeme")
    assert Settings(proposal_signing_key="").proposal_signing_key == ""


def test_the_e2e_app_cannot_be_loaded_outside_the_e2e_environment():
    import importlib

    with pytest.raises(RuntimeError, match="Playwright"):
        importlib.import_module("tests.e2e_app")


def test_a_slow_turn_stops_repairing(monkeypatch):
    from app.agent import orchestrator
    from tests.agent.fakes import call as tool_call

    clock = iter([0, 1000, 1000, 1000])
    # Replace the module's `time` (not time.monotonic itself): the event loop shares the real clock.
    monkeypatch.setattr(orchestrator, "time", SimpleNamespace(monotonic=lambda: next(clock)))
    client = FakeOpenAI(reply(None, [tool_call("add_shelf", compartmentId="cmp_missing", y=500)]))
    use_client(client)
    data = http.post("/api/chat", json=chat_body()).json()["data"]
    assert data["proposal"] is None and len(client.requests) == 1


def test_413_and_http_errors_keep_cors_headers_and_the_envelope():
    origin = {"Origin": "http://localhost:5173"}
    big = http.post("/api/chat", content=b"x" * 300_000, headers={"content-type": "application/json", **origin})
    assert big.status_code == 413 and big.headers["access-control-allow-origin"] == "http://localhost:5173"
    missing = http.get("/api/nope")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "HTTP_ERROR"
    unparsable = http.post("/api/chat", content=b"{not json", headers={"content-type": "application/json"})
    assert unparsable.json()["success"] is False


def test_chat_passes_the_configured_temperature_to_the_model():
    client = use_client(FakeOpenAI(reply("ok")))
    http.post("/api/chat", json=chat_body())
    assert client.requests[0]["temperature"] == 0.2
    app.dependency_overrides[get_settings] = lambda: Settings(
        openai_api_key="k", openai_chat_model="m", proposal_signing_key=KEY, openai_temperature=None, chat_rate_limit="1000/minute"
    )
    client = use_client(FakeOpenAI(reply("ok")))
    http.post("/api/chat", json=chat_body())
    assert "temperature" not in client.requests[0]
