import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.chat import get_chat_client, limiter
from app.config import Settings, get_settings
from app.domain.defaults import basic_wardrobe
from app.main import app

KEY = "k" * 40


def settings(**kw):
    base = dict(openai_api_key="sk-test", proposal_signing_key=KEY, chat_rate_limit="1000/minute")
    return Settings(_env_file=None, **{**base, **kw})


def completion(content=None, tool=None, args=None):
    calls = None
    if tool:
        calls = [SimpleNamespace(id="call_1", function=SimpleNamespace(name=tool, arguments=json.dumps(args)))]
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=calls))])


class FakeClient:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


@pytest.fixture
def make_client():
    limiter.reset()

    def build(fake, cfg=None):
        app.dependency_overrides[get_settings] = lambda: cfg or settings()
        app.dependency_overrides[get_chat_client] = lambda: fake
        return TestClient(app)

    yield build
    app.dependency_overrides.clear()


def body(text="make it 2400 wide"):
    return {"messages": [{"role": "user", "content": text}], "design": basic_wardrobe(), "revision": 1}


WIDTH_OPS = {"summary": "Wider", "ops": [{"op": "update_dimensions", "width": 2400}]}


def test_valid_proposal_is_signed(make_client):
    http = make_client(FakeClient(completion("Sure.", "propose_changes", WIDTH_OPS)))
    data = http.post("/api/chat", json=body()).json()["data"]
    assert data["proposal"]["baseRevision"] == 1
    assert len(data["proposal"]["signature"]) == 64
    assert data["proposal"]["ops"] == WIDTH_OPS["ops"]


@pytest.mark.parametrize(("units", "expected"), [(None, "in cm, never in millimetres"), ("in", "in in, never in millimetres")])
def test_agent_is_told_the_display_unit(make_client, units, expected):
    fake = FakeClient(completion("Sure.", "propose_changes", WIDTH_OPS))
    payload = body() if units is None else {**body(), "units": units}
    assert make_client(fake).post("/api/chat", json=payload).status_code == 200
    assert expected in fake.calls[0]["messages"][0]["content"]


def test_invalid_ops_trigger_repair_then_succeed(make_client):
    bad = {"summary": "x", "ops": [{"op": "update_dimensions", "width": 99999}]}
    fake = FakeClient(completion(None, "propose_changes", bad), completion(None, "propose_changes", WIDTH_OPS))
    data = make_client(fake).post("/api/chat", json=body()).json()["data"]
    assert data["proposal"] is not None and len(fake.calls) == 2


def test_gives_up_with_clarification_after_repairs(make_client):
    bad = {"summary": "x", "ops": [{"op": "nope"}]}
    fake = FakeClient(*[completion(None, "propose_changes", bad)] * 3)
    data = make_client(fake).post("/api/chat", json=body()).json()["data"]
    assert data["proposal"] is None and "rephrase" in data["reply"] and len(fake.calls) == 3


def test_clarification_and_plain_reply_have_no_proposal(make_client):
    http = make_client(FakeClient(completion(None, "ask_clarification", {"question": "How wide?"}), completion("No prices, sorry.")))
    assert http.post("/api/chat", json=body()).json()["data"] == {"reply": "How wide?", "proposal": None}
    assert http.post("/api/chat", json=body("how much?")).json()["data"]["proposal"] is None


def test_missing_key_is_503(make_client):
    app.dependency_overrides.clear()
    app.dependency_overrides[get_settings] = lambda: settings(openai_api_key=None)
    response = TestClient(app).post("/api/chat", json=body())
    assert response.status_code == 503 and response.json()["error"]["code"] == "AGENT_NOT_CONFIGURED"


@pytest.mark.parametrize(
    "payload",
    [
        {**body(), "messages": []},
        {**body(), "messages": [{"role": "system", "content": "x"}]},
        {**body(), "messages": [{"role": "user", "content": "x" * 2001}]},
        {**body(), "messages": [{"role": "user", "content": "x"}] * 21},
        {**body(), "extra": 1},
        {**body(), "units": "mm"},
        {**body(), "units": "furlong"},
    ],
)
def test_bad_requests_rejected_without_echo(make_client, payload):
    response = make_client(FakeClient()).post("/api/chat", json=payload)
    assert response.status_code == 422 and "xxx" not in response.text


def test_openai_failure_is_502_without_details(make_client):
    from openai import APIConnectionError
    import httpx2 as httpx

    class Boom:
        def create(self, **_):
            raise APIConnectionError(request=httpx.Request("POST", "https://x"))

    response = make_client(Boom()).post("/api/chat", json=body())
    assert response.status_code == 502 and "sk-test" not in response.text


@pytest.mark.parametrize(("code", "status", "app_code"), [("insufficient_quota", 503, "AGENT_QUOTA"), ("rate_limit_exceeded", 429, "AGENT_BUSY")])
def test_openai_quota_and_rate_limit_are_distinct(make_client, code, status, app_code):
    import httpx2 as httpx
    from openai import RateLimitError

    class Limited:
        def create(self, **_):
            response = httpx.Response(429, request=httpx.Request("POST", "https://x"))
            raise RateLimitError("limit", response=response, body={"code": code})

    response = make_client(Limited()).post("/api/chat", json=body())
    assert (response.status_code, response.json()["error"]["code"]) == (status, app_code)


def test_rate_limit(make_client, monkeypatch):
    cfg = settings(chat_rate_limit="2/minute")
    monkeypatch.setattr("app.api.chat.get_settings", lambda: cfg)
    http = make_client(FakeClient(*[completion("ok")] * 5), cfg)
    codes = [http.post("/api/chat", json=body()).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def apply_body(proposal, revision=1, design=None):
    return {"design": design or basic_wardrobe(), "revision": revision, "proposal": proposal}


def get_proposal(make_client):
    http = make_client(FakeClient(completion(None, "propose_changes", WIDTH_OPS)))
    return http, http.post("/api/chat", json=body()).json()["data"]["proposal"]


def test_apply_returns_new_design_and_revision(make_client):
    http, proposal = get_proposal(make_client)
    data = http.post("/api/proposals/apply", json=apply_body(proposal)).json()["data"]
    assert data["revision"] == 2 and data["design"]["dimensions"]["width"] == 2400


def test_apply_rejects_tampered_ops_and_signature(make_client):
    http, proposal = get_proposal(make_client)
    tampered = {**proposal, "ops": [{"op": "update_dimensions", "width": 3000}]}
    assert http.post("/api/proposals/apply", json=apply_body(tampered)).status_code == 403
    forged = {**proposal, "signature": "0" * 64}
    assert http.post("/api/proposals/apply", json=apply_body(forged)).status_code == 403


def test_apply_stale_revision_and_hash_are_409(make_client):
    http, proposal = get_proposal(make_client)
    assert http.post("/api/proposals/apply", json=apply_body(proposal, revision=2)).status_code == 409
    changed = basic_wardrobe()
    changed["dimensions"]["height"] = 2300
    response = http.post("/api/proposals/apply", json=apply_body(proposal, design=changed))
    assert response.status_code == 409 and response.json()["error"]["code"] == "STALE"


def test_non_ascii_or_malformed_signature_is_422_not_500(make_client):
    http, proposal = get_proposal(make_client)
    for bad in ["é" * 64, "Z" * 64, "a" * 63]:
        assert http.post("/api/proposals/apply", json=apply_body({**proposal, "signature": bad})).status_code == 422


def test_oversized_body_and_design_are_rejected(make_client):
    http = make_client(FakeClient())
    big = {**body(), "design": {"pad": "x" * 400_000}}
    assert http.post("/api/chat", json=big).status_code == 413
    mid = {**body(), "design": {"pad": "x" * 210_000}}
    assert http.post("/api/chat", json=mid).json()["error"]["code"] == "DESIGN_TOO_LARGE"


def test_global_hourly_cap(make_client, monkeypatch):
    from app.api import chat as chat_module

    chat_module._recent.clear()
    cfg = settings(chat_hourly_cap=2)
    http = make_client(FakeClient(*[completion("ok")] * 5), cfg)
    codes = [http.post("/api/chat", json=body()).status_code for _ in range(3)]
    chat_module._recent.clear()
    assert codes == [200, 200, 429]


def test_unexpected_errors_use_the_envelope_without_details(make_client):
    class Broken:
        def create(self, **_):
            raise RuntimeError("secret internal detail")

    make_client(Broken())
    http = TestClient(app, raise_server_exceptions=False)
    response = http.post("/api/chat", json=body())
    assert response.status_code == 500 and "secret" not in response.text
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
