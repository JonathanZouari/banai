"""Signed chat proposals (ADR-020): signing, the propose_changes tool, the chat API and /api/proposals/apply."""

import copy
import json
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app.agent import chat as agent_chat
from app.agent.chat import PROPOSE_TOOL_NAME, ChatResult, make_proposer, run_chat
from app.agent.proposals import design_hash, sign, verify
from app.api.chat import get_chat_runner
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.domain.schema import parse_design
from app.main import app

KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ"
WIDER = [{"op": "update_dimensions", "width": 2400}]
client = TestClient(app)


def reply(text=None, calls=()):
    return NS(output=list(calls), output_text=text or "")


def propose_call(arguments, call_id="p1"):
    return NS(type="function_call", id=f"fc_{call_id}", call_id=call_id, name=PROPOSE_TOOL_NAME,
              arguments=json.dumps(arguments, ensure_ascii=False))


class FakeClient:
    def __init__(self, *responses):
        self.queue = list(responses)
        self.calls = []
        self.responses = NS(create=self._create)
        self.closed = False

    def _create(self, **kwargs):
        self.calls.append({**kwargs, "input": list(kwargs["input"])})
        return self.queue.pop(0)

    def close(self):
        self.closed = True


# ---- signing ----
def test_a_signed_proposal_verifies_and_any_change_breaks_it():
    proposal = sign(WIDER, "רוחב 240", 3, basic_wardrobe())
    assert verify(proposal)
    for key, value in (("ops", [{"op": "update_dimensions", "width": 9999}]), ("summary", "x"), ("baseRevision", 4),
                       ("baseHash", "0" * 64), ("signature", "0" * 64)):
        tampered = {**proposal, key: value}
        assert not verify(tampered), key
    assert not verify({k: v for k, v in proposal.items() if k != "baseHash"})
    assert not verify(proposal, secret=b"another server")


def test_the_design_hash_ignores_key_order_and_v1_spelling():
    design = basic_wardrobe()
    shuffled = json.loads(json.dumps(design, sort_keys=True))
    assert design_hash(parse_design(shuffled)) == design_hash(design)
    v1 = copy.deepcopy(design)
    v1["schemaVersion"] = 1
    del v1["site"]
    assert design_hash(parse_design(v1)) == design_hash(design)
    changed = copy.deepcopy(design)
    changed["dimensions"]["width"] = 2010
    assert design_hash(changed) != design_hash(design)


# ---- the tool ----
def test_the_tool_signs_only_what_the_engine_accepts():
    holder = {"proposal": None}
    propose = make_proposer(basic_wardrobe(), 5, load_catalog(), holder)
    bad = propose(json.dumps({"summary": "מדף", "ops": [{"op": "add_shelf", "compartmentId": "cmp_nope", "y": 300}]}))
    assert bad["ok"] is False and bad["error"]["code"] == "NOT_FOUND" and holder["proposal"] is None
    assert propose("not json")["ok"] is False
    assert propose(json.dumps({"ops": WIDER}))["error"]["path"] == "summary"
    good = propose(json.dumps({"summary": "רוחב 240\u202e\x07", "ops": WIDER}))
    assert good["ok"] is True
    proposal = holder["proposal"]
    assert verify(proposal) and proposal["baseRevision"] == 5 and proposal["ops"] == WIDER
    assert proposal["summary"] == "רוחב 240"  # control and bidi-override characters are stripped
    assert proposal["baseHash"] == design_hash(basic_wardrobe())


def test_a_rejected_proposal_goes_back_to_the_model_which_can_fix_it():
    holder = {"proposal": None}
    propose = make_proposer(basic_wardrobe(), 1, load_catalog(), holder)
    fake = FakeClient(
        reply(calls=[propose_call({"summary": "x", "ops": [{"op": "update_dimensions", "width": 99999}]})]),
        reply(calls=[propose_call({"summary": "רוחב 240", "ops": WIDER}, "p2")]),
        reply("הצעתי להרחיב ל-240 ס״מ."),
    )
    text = run_chat(fake, "m", [{"role": "user", "content": "תרחיב"}], context="CTX", propose=propose)
    assert text == "הצעתי להרחיב ל-240 ס״מ."
    first_output = json.loads(fake.calls[1]["input"][-1]["output"])
    assert first_output == {"ok": False, "error": {"code": "OUT_OF_RANGE", "path": "ops[0].width",
                                                   "message": first_output["error"]["message"]}}
    assert holder["proposal"]["ops"] == WIDER
    assert [t["name"] for t in fake.calls[0]["tools"]] == ["get_jerusalem_weather", PROPOSE_TOOL_NAME]
    # The design context sits just before the customer's latest message.
    assert fake.calls[0]["input"][-2] == {"role": "developer", "content": "CTX"}


def test_answer_with_a_design_sends_it_and_returns_a_signed_proposal(monkeypatch):
    monkeypatch.setattr(agent_chat, "chat_model_for", lambda *a: "m")
    fake = FakeClient(reply(calls=[propose_call({"summary": "רוחב 240", "ops": WIDER})]), reply("אפשר להרחיב."))
    result = agent_chat.answer(KEY, [{"role": "user", "content": "תרחיב"}], None, client_factory=lambda **kw: fake,
                               design=basic_wardrobe(), revision=7)
    assert result.reply == "אפשר להרחיב." and verify(result.proposal) and result.proposal["baseRevision"] == 7
    context = fake.calls[0]["input"][-2]["content"]
    assert "CURRENT DESIGN (revision 7" in context and '"cmp_left"' in context and "r3-wide" in context
    assert "white (לבן)" in context and fake.closed


def test_answer_without_a_design_stays_text_only(monkeypatch):
    monkeypatch.setattr(agent_chat, "chat_model_for", lambda *a: "m")
    fake = FakeClient(reply("שלום"))
    result = agent_chat.answer(KEY, [{"role": "user", "content": "היי"}], None, client_factory=lambda **kw: fake)
    assert result.proposal is None
    assert [t["name"] for t in fake.calls[0]["tools"]] == ["get_jerusalem_weather"]


# ---- the chat API ----
@pytest.fixture
def chat_runner():
    calls = []

    def use(result):
        def runner(api_key, messages, model, **kwargs):
            calls.append(kwargs)
            return result

        app.dependency_overrides[get_chat_runner] = lambda: runner
        return calls

    yield use
    app.dependency_overrides.clear()


def test_chat_sends_the_canonical_design_and_returns_the_proposal(chat_runner):
    proposal = sign(WIDER, "רוחב 240", 2, basic_wardrobe())
    calls = chat_runner(ChatResult("הצעה", "m", proposal))
    v1 = copy.deepcopy(basic_wardrobe())
    v1["schemaVersion"] = 1
    body = {"apiKey": KEY, "messages": [{"role": "user", "content": "תרחיב"}], "design": v1, "revision": 2}
    response = client.post("/api/chat", json=body)
    assert response.status_code == 200
    assert response.json()["data"] == {"reply": "הצעה", "model": "m", "proposal": proposal}
    assert calls[0]["design"] == basic_wardrobe() and calls[0]["revision"] == 2  # parsed to canonical v2


@pytest.mark.parametrize(("extra", "status", "code"), [
    ({"design": {"dimensions": {}}, "revision": 1}, 422, "SCHEMA_INVALID"),
    ({"design": None}, 200, None),
])
def test_chat_validates_the_design_before_the_agent(chat_runner, extra, status, code):
    calls = chat_runner(ChatResult("ok", "m"))
    response = client.post("/api/chat", json={"apiKey": KEY, "messages": [{"role": "user", "content": "x"}], **extra})
    assert response.status_code == status
    if code:
        assert response.json()["error"]["code"] == code and calls == []


def test_a_design_needs_its_revision(chat_runner):
    chat_runner(ChatResult("ok", "m"))
    response = client.post("/api/chat", json={"apiKey": KEY, "messages": [{"role": "user", "content": "x"}], "design": basic_wardrobe()})
    assert response.status_code == 400 and response.json()["error"]["code"] == "INVALID_REVISION"


# ---- /api/proposals/apply ----
def apply(design, revision, proposal):
    return client.post("/api/proposals/apply", json={"design": design, "revision": revision, "proposal": proposal})


def test_a_confirmed_proposal_applies_and_bumps_the_revision():
    proposal = sign(WIDER, "רוחב 240", 4, basic_wardrobe())
    response = apply(basic_wardrobe(), 4, proposal)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["revision"] == 5 and data["design"]["dimensions"]["width"] == 2400


def test_a_stale_proposal_is_a_409():
    proposal = sign(WIDER, "רוחב 240", 4, basic_wardrobe())
    assert apply(basic_wardrobe(), 5, proposal).status_code == 409  # the revision moved on
    edited = copy.deepcopy(basic_wardrobe())
    edited["dimensions"]["height"] = 2300
    response = apply(edited, 4, proposal)  # same revision number, a different design
    assert response.status_code == 409 and response.json()["error"]["code"] == "STALE"


def test_a_forged_or_edited_proposal_is_refused():
    proposal = sign(WIDER, "רוחב 240", 4, basic_wardrobe())
    forged = {**proposal, "ops": [{"op": "update_dimensions", "width": 3000}]}
    response = apply(basic_wardrobe(), 4, forged)
    assert response.status_code == 400 and response.json()["error"]["code"] == "BAD_SIGNATURE"
    assert apply(basic_wardrobe(), 4, {"ops": WIDER}).status_code == 400


def test_apply_validates_the_design_first():
    proposal = sign(WIDER, "רוחב 240", 4, basic_wardrobe())
    broken = copy.deepcopy(basic_wardrobe())
    broken["dimensions"]["width"] = 99999
    response = apply(broken, 4, proposal)
    assert response.status_code == 422 and response.json()["error"]["code"] == "OUT_OF_RANGE"


# ---- security review 2026-10-17 (Day 4), LOW findings ----
def test_what_is_signed_is_what_the_browser_sends_back():
    """2400.0 from the model is signed as 2400, so a JSON round trip in JavaScript keeps the signature."""
    holder = {"proposal": None}
    propose = make_proposer(basic_wardrobe(), 4, load_catalog(), holder)
    assert propose(json.dumps({"summary": "רוחב 240", "ops": [{"op": "update_dimensions", "width": 2400.0}]}))["ok"] is True
    proposal = holder["proposal"]
    assert proposal["ops"] == WIDER and isinstance(proposal["ops"][0]["width"], int)
    round_trip = json.loads(json.dumps(proposal).replace("2400.0", "2400"))
    response = apply(basic_wardrobe(), 4, round_trip)
    assert response.status_code == 200 and response.json()["data"]["design"]["dimensions"]["width"] == 2400


def test_a_lone_surrogate_from_the_model_is_refused_not_a_crash():
    holder = {"proposal": None}
    propose = make_proposer(basic_wardrobe(), 4, load_catalog(), holder)
    result = propose('{"summary": "\ud800", "ops": [{"op": "update_dimensions", "width": 2400}]}')
    assert result["ok"] is False and result["error"]["path"] == "arguments" and holder["proposal"] is None
    result = propose('{"summary": "x", "ops": [{"op": "update_dimensions", "width": 2400, "note": "\udfff"}]}')
    assert result["ok"] is False and holder["proposal"] is None


def test_a_non_ascii_signature_is_refused_not_a_500():
    proposal = {**sign(WIDER, "רוחב 240", 4, basic_wardrobe()), "signature": "é" * 64}
    assert verify(proposal) is False
    response = apply(basic_wardrobe(), 4, proposal)
    assert response.status_code == 400 and response.json()["error"]["code"] == "BAD_SIGNATURE"


def test_apply_answers_busy_at_once_when_its_slots_are_taken(monkeypatch):
    import threading

    from app.api import proposals as proposals_api

    monkeypatch.setattr(proposals_api, "_slots", threading.BoundedSemaphore(1))
    proposals_api._slots.acquire()
    try:
        response = apply(basic_wardrobe(), 4, sign(WIDER, "רוחב 240", 4, basic_wardrobe()))
        assert response.status_code == 429 and response.json()["error"]["code"] == "BUSY"
    finally:
        proposals_api._slots.release()
    assert apply(basic_wardrobe(), 4, sign(WIDER, "רוחב 240", 4, basic_wardrobe())).status_code == 200


@pytest.mark.parametrize(("path", "body"), [
    ("/api/chat", {"apiKey": KEY + "x" * 600, "messages": [{"role": "user", "content": "hi"}]}),
    ("/api/settings/ai/verify", {"apiKey": KEY + "x" * 600}),
    ("/api/chat", [KEY]),
])
def test_validation_errors_use_our_envelope_and_never_echo_the_input(path, body):
    response = client.post(path, json=body)
    assert response.status_code == 422
    assert response.json() == {"success": False, "data": None, "error": {"code": "INVALID_REQUEST", "message": "The request is not valid."}}
    assert KEY not in response.text
