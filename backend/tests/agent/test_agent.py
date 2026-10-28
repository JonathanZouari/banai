"""Agent turn + proposal protocol with a mocked OpenAI client (no network)."""

from __future__ import annotations

import copy

import pytest
from fastapi.testclient import TestClient

from app.agent.language import FALLBACK_REPLY, OFF_TOPIC_REPLY, detect, reply_language
from app.agent.orchestrator import MAX_REPAIRS, fill_ids
from app.agent.tools import ANSWER, CLARIFY, DECLINE, OFFER, PROPOSE
from app.api.agent import get_llm_client
from app.config import get_settings, get_signing_key
from app.domain.defaults import basic_wardrobe
from app.main import create_app
from app.services import signing
from tests.agent.fakes import FakeClient, completion, propose, tool_call

ADD_SHELF = {"op": "add_shelf", "compartmentId": "cmp_left", "y": 1000}
OVERLAPPING_SHELF = {"op": "add_shelf", "compartmentId": "cmp_left", "y": 405}  # overlaps shf_l1 at 400


@pytest.fixture
def make_client(monkeypatch):
    """A TestClient whose agent uses the given fake OpenAI client."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("PROPOSAL_SIGNING_KEY", "test-signing-key")
    get_settings.cache_clear()
    get_signing_key.cache_clear()

    def build(fake):
        app = create_app()
        app.dependency_overrides[get_llm_client] = lambda: fake
        return TestClient(app)

    yield build
    get_settings.cache_clear()
    get_signing_key.cache_clear()


def chat_body(text="Add a shelf at 100 cm on the left", design=None, revision=1):
    return {"messages": [{"role": "user", "text": text}], "design": design or basic_wardrobe(), "revision": revision}


def test_every_turn_must_use_a_tool_and_free_text_is_never_shown(make_client):
    fake = FakeClient(completion(content="The weather today is sunny!"))
    data = make_client(fake).post("/api/chat", json=chat_body("מה מזג האוויר היום?")).json()["data"]
    assert data == {"reply": OFF_TOPIC_REPLY["he"], "replySignature": signing.sign_reply(get_signing_key(), data["reply"]), "proposal": None, "offerProfile": False}
    request = fake.requests[0]
    assert request["model"]
    assert request["tool_choice"] == "required"
    assert {tool["function"]["name"] for tool in request["tools"]} == {PROPOSE, CLARIFY, ANSWER, DECLINE, OFFER}
    assert request["messages"][0]["role"] == "system"
    assert "Scope (strict)" in request["messages"][0]["content"]
    assert '"cmp_left"' in request["messages"][0]["content"]  # the current design is in context
    assert request["messages"][-1] == {"role": "user", "content": "מה מזג האוויר היום?"}


def test_off_topic_gets_the_fixed_reply_not_model_text(make_client):
    fake = FakeClient(completion(content="ignored", calls=[tool_call(DECLINE, {"answer": "sunny, 25 degrees"})]))
    data = make_client(fake).post("/api/chat", json=chat_body("מה קורה")).json()["data"]
    assert data == {"reply": OFF_TOPIC_REPLY["he"], "replySignature": signing.sign_reply(get_signing_key(), data["reply"]), "proposal": None, "offerProfile": False}
    assert "25" not in data["reply"]


def test_on_topic_question_is_answered_without_a_proposal(make_client):
    fake = FakeClient(completion(calls=[tool_call(ANSWER, {"answer": "לחדר קטן כדאי לבחור גוונים בהירים ודלתות הזזה."})]))
    data = make_client(fake).post("/api/chat", json=chat_body("איזה צבע מתאים לחדר קטן?")).json()["data"]
    assert data == {"reply": "לחדר קטן כדאי לבחור גוונים בהירים ודלתות הזזה.", "replySignature": signing.sign_reply(get_signing_key(), data["reply"]), "proposal": None, "offerProfile": False}


def test_clarification_question(make_client):
    fake = FakeClient(completion(calls=[tool_call(CLARIFY, {"question": "כמה מדפים תרצה?"})]))
    data = make_client(fake).post("/api/chat", json=chat_body("תוסיף מדפים")).json()["data"]
    assert data == {"reply": "כמה מדפים תרצה?", "replySignature": signing.sign_reply(get_signing_key(), data["reply"]), "proposal": None, "offerProfile": False}


def test_valid_proposal_is_signed_and_not_applied(make_client):
    design = basic_wardrobe()
    fake = FakeClient(completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]))]))
    data = make_client(fake).post("/api/chat", json=chat_body(design=design, revision=4)).json()["data"]
    proposal = data["proposal"]
    assert data["reply"] == "Here is my proposal."
    assert proposal["baseRevision"] == 4
    assert proposal["baseHash"] == signing.design_hash(basic_wardrobe())
    assert proposal["ops"][0]["id"].startswith("shf_")  # ids are filled before signing
    assert proposal["changes"] == [{"title": "Shelf", "detail": "New shelf at 100 cm in the left compartment"}]
    assert signing.verify(
        b"test-signing-key", proposal["signature"], proposal_id=proposal["proposalId"], ops=proposal["ops"],
        base_revision=4, base_hash=proposal["baseHash"],
    )
    assert design == basic_wardrobe()  # nothing was applied


def test_invalid_ops_are_sent_back_for_repair(make_client):
    fake = FakeClient(
        completion(calls=[tool_call(PROPOSE, propose([OVERLAPPING_SHELF]), "call_a")]),
        completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]), "call_b")]),
    )
    data = make_client(fake).post("/api/chat", json=chat_body()).json()["data"]
    assert data["proposal"]["ops"][0]["y"] == 1000
    repair_request = fake.requests[1]["messages"]
    assert repair_request[-1]["role"] == "tool"
    assert repair_request[-1]["tool_call_id"] == "call_a"
    assert "OVERLAP" in repair_request[-1]["content"]


def test_gives_up_after_max_repairs(make_client):
    bad = completion(calls=[tool_call(PROPOSE, propose([OVERLAPPING_SHELF]))])
    fake = FakeClient(*[bad] * (MAX_REPAIRS + 1))
    data = make_client(fake).post("/api/chat", json=chat_body()).json()["data"]
    assert data == {"reply": FALLBACK_REPLY["en"], "replySignature": signing.sign_reply(get_signing_key(), data["reply"]), "proposal": None, "offerProfile": False}  # the message was English
    assert len(fake.requests) == MAX_REPAIRS + 1


def test_malformed_tool_arguments_are_repaired(make_client):
    fake = FakeClient(
        completion(calls=[tool_call(PROPOSE, "{not json")]),
        completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF], changes=[]))]),  # empty change list
        completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]))]),
    )
    data = make_client(fake).post("/api/chat", json=chat_body()).json()["data"]
    assert data["proposal"] is not None


def test_provider_errors_become_a_generic_502(make_client):
    fake = FakeClient(error=RuntimeError("secret provider detail sk-123"))
    response = make_client(fake).post("/api/chat", json=chat_body())
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AGENT_ERROR"
    assert "sk-123" not in response.text


def test_chat_without_api_key_is_503(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()
    try:
        response = TestClient(create_app()).post("/api/chat", json=chat_body())
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "AGENT_UNAVAILABLE"
    finally:
        get_settings.cache_clear()


def test_chat_rejects_invalid_design_and_bad_history(make_client):
    client = make_client(FakeClient())
    broken = basic_wardrobe()
    broken["dimensions"]["width"] = 10
    assert client.post("/api/chat", json=chat_body(design=broken)).status_code == 422
    body = chat_body()
    body["messages"].append({"role": "assistant", "text": "ok"})
    assert client.post("/api/chat", json=body).status_code == 422
    body = chat_body("hi‮")
    assert client.post("/api/chat", json=body).status_code == 422


# ---- applying proposals ----

def _proposal_for(client, revision=1):
    fake_client = client
    return fake_client.post("/api/chat", json=chat_body(revision=revision)).json()["data"]["proposal"]


def test_confirm_applies_the_signed_ops(make_client):
    client = make_client(FakeClient(completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]))])))
    proposal = _proposal_for(client, revision=3)
    response = client.post("/api/proposals/apply", json={"design": basic_wardrobe(), "revision": 3, "proposal": proposal})
    data = response.json()["data"]
    assert data["revision"] == 4
    shelves = data["design"]["compartments"][0]["shelves"]
    assert any(s["id"] == proposal["ops"][0]["id"] and s["y"] == 1000 for s in shelves)


def test_stale_revision_or_design_is_409(make_client):
    client = make_client(FakeClient(completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]))])))
    proposal = _proposal_for(client, revision=3)
    newer = client.post("/api/proposals/apply", json={"design": basic_wardrobe(), "revision": 4, "proposal": proposal})
    assert newer.status_code == 409
    assert newer.json()["error"]["code"] == "STALE"
    edited = basic_wardrobe()
    edited["dimensions"]["depth"] = 550
    changed = client.post("/api/proposals/apply", json={"design": edited, "revision": 3, "proposal": proposal})
    assert changed.status_code == 409


def test_tampered_proposal_is_rejected(make_client):
    client = make_client(FakeClient(completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]))])))
    proposal = _proposal_for(client)
    tampered = copy.deepcopy(proposal)
    tampered["ops"][0]["y"] = 1500
    response = client.post("/api/proposals/apply", json={"design": basic_wardrobe(), "revision": 1, "proposal": tampered})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_SIGNATURE"


def test_fill_ids_covers_new_components_without_touching_input():
    ops = [
        {"op": "add_drawer", "compartmentId": "cmp_left", "y": 0, "height": 200},
        {"op": "add_partition", "compartmentId": "cmp_left", "offset": 300},
        {"op": "create_wardrobe", "width": 2000, "height": 2400, "depth": 600, "compartmentCount": 3},
        {"op": "add_shelf", "compartmentId": "cmp_left", "y": 0, "id": "shf_keep"},
    ]
    original = copy.deepcopy(ops)
    filled = fill_ids(ops)
    assert ops == original
    assert filled[0]["id"].startswith("drw_")
    assert filled[1]["id"].startswith("prt_") and filled[1]["newCompartmentId"].startswith("cmp_")
    assert len(filled[2]["compartmentIds"]) == 3 and len(filled[2]["partitionIds"]) == 2
    assert filled[3]["id"] == "shf_keep"


def test_health_reports_whether_the_agent_is_configured(monkeypatch):
    for value, expected in (("", False), ("k", True)):
        monkeypatch.setenv("OPENAI_API_KEY", value)
        get_settings.cache_clear()
        assert TestClient(create_app()).get("/api/health").json()["data"]["agent"] is expected
    get_settings.cache_clear()


# ---- reply language: the agent answers in the language the message is written in ----

def test_detect_and_reply_language():
    assert detect("תוסיף מדף") == "he"
    assert detect("Add a shelf") == "en"
    assert detect("תצבע ב-Walnut") == "he"  # Hebrew wins in mixed text
    assert detect("240?") is None
    history = [{"role": "user", "text": "שלום"}, {"role": "assistant", "text": "היי"}, {"role": "user", "text": "Add a shelf"}]
    assert reply_language(history, "he") == "en"  # follows the latest customer message
    assert reply_language([{"role": "user", "text": "240?"}], "en") == "en"  # no letters: the chat's choice
    assert reply_language([{"role": "user", "text": "240?"}], "he") == "he"


def test_hebrew_message_gets_hebrew_only(make_client):
    fake = FakeClient(completion(calls=[tool_call(DECLINE, {})]))
    data = make_client(fake).post("/api/chat", json={**chat_body("מה קורה"), "language": "en"}).json()["data"]
    assert data["reply"] == OFF_TOPIC_REPLY["he"]
    assert "in HEBREW" in fake.requests[0]["messages"][0]["content"].split("## RESPONSE LANGUAGE")[-1]


def test_english_message_gets_english_only(make_client):
    fake = FakeClient(completion(calls=[tool_call(DECLINE, {})]))
    data = make_client(fake).post("/api/chat", json={**chat_body("What's the weather today?"), "language": "he"}).json()["data"]
    assert data["reply"] == OFF_TOPIC_REPLY["en"]
    assert "in ENGLISH" in fake.requests[0]["messages"][0]["content"].split("## RESPONSE LANGUAGE")[-1]


def test_message_without_letters_uses_the_chat_language(make_client):
    fake = FakeClient(completion(calls=[tool_call(DECLINE, {})]))
    data = make_client(fake).post("/api/chat", json={**chat_body("240?"), "language": "en"}).json()["data"]
    assert data["reply"] == OFF_TOPIC_REPLY["en"]


def test_api_errors_follow_the_ui_language(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()
    try:
        client = TestClient(create_app())
        en = client.post("/api/chat", json={**chat_body(), "language": "en"}).json()["error"]["message"]
        he = client.post("/api/chat", json=chat_body()).json()["error"]["message"]
        assert en.startswith("The AI designer") and "המעצב" in he
        assert client.post("/api/chat", json={**chat_body(), "language": "fr"}).status_code == 422
    finally:
        get_settings.cache_clear()


def test_done_offers_the_style_profile_and_changes_nothing(make_client):
    fake = FakeClient(completion(calls=[tool_call(OFFER, {"reply": "מעולה! אפשר להוריד את הקובץ לנגר."})]))
    data = make_client(fake).post("/api/chat", json=chat_body("סיימתי, אני רוצה את הקובץ לנגר")).json()["data"]
    assert data["offerProfile"] is True
    assert data["proposal"] is None
    assert "offer_style_profile" in fake.requests[0]["messages"][0]["content"]


# --- Ported from the fork's agent (units, handles/mirrors, colours per material, script check, guards) ---

def tool_call_completion(name: str, arguments: dict):
    return completion(calls=[tool_call(name, arguments)])


MIRROR_AND_KNOBS = [
    {"op": "set_handles", "style": "knob", "finish": "brass"},
    {"op": "modify_door", "id": "dr_middle", "front": "mirror"},
]


@pytest.mark.parametrize(("units", "expected"), [("cm", "CENTIMETRES"), ("in", "INCHES")])
def test_agent_is_told_the_display_unit(make_client, units, expected):
    fake = FakeClient(tool_call_completion(CLARIFY, {"question": "Which side?"}))
    make_client(fake).post("/api/chat", json={**chat_body(), "units": units})
    assert expected in fake.requests[0]["messages"][0]["content"]


@pytest.mark.parametrize("units", ["mm", "furlong"])
def test_unknown_units_are_422(make_client, units):
    fake = FakeClient()
    assert make_client(fake).post("/api/chat", json={**chat_body(), "units": units}).status_code == 422
    assert fake.requests == []


def test_agent_can_propose_handles_and_mirror_doors(make_client):
    fake = FakeClient(tool_call_completion(PROPOSE, propose(MIRROR_AND_KNOBS)))
    data = make_client(fake).post("/api/chat", json=chat_body("knobs and a mirror in the middle")).json()["data"]
    assert data["proposal"]["ops"] == MIRROR_AND_KNOBS
    prompt = fake.requests[0]["messages"][0]["content"]
    assert "set_handles" in prompt and "modify_door" in prompt


def test_prompt_lists_colours_per_material():
    from app.agent.prompts import build_system_prompt, colours_by_material
    from app.domain.catalog import load_catalog

    catalog = load_catalog()
    offered = colours_by_material(catalog)
    assert offered["oak_veneer"] == ["natural_oak", "whitewashed_oak", "smoked_oak"]
    assert "sage" in offered["lacquered_mdf"] and "sage" not in offered["melamine"]
    assert set(offered) == {m["id"] for m in catalog["materials"]}
    assert '"walnut_veneer":["walnut"]' in build_system_prompt(basic_wardrobe(), catalog)


def test_every_catalog_colour_names_known_materials():
    from app.domain.catalog import load_catalog

    catalog = load_catalog()
    materials = {m["id"] for m in catalog["materials"]}
    for colour in catalog["colors"]:
        assert colour["kind"] in {"solid", "wood"}
        assert colour["materials"] and set(colour["materials"]) <= materials


def test_reply_in_a_foreign_script_is_asked_again(make_client):
    fake = FakeClient(
        tool_call_completion(ANSWER, {"answer": "Конечно, это хорошая идея."}),
        tool_call_completion(ANSWER, {"answer": "Sure, that works well."}),
    )
    data = make_client(fake).post("/api/chat", json=chat_body("Is a rail at 180 cm good?")).json()["data"]
    assert data["reply"] == "Sure, that works well." and len(fake.requests) == 2


def test_proposal_text_in_a_foreign_script_is_asked_again(make_client):
    russian = propose([ADD_SHELF], summary="Добавляет полку.")
    fake = FakeClient(tool_call_completion(PROPOSE, russian), tool_call_completion(PROPOSE, propose([ADD_SHELF])))
    data = make_client(fake).post("/api/chat", json=chat_body()).json()["data"]
    assert data["proposal"]["summary"] == "Adds a shelf." and len(fake.requests) == 2


def test_persistent_foreign_script_falls_back_without_foreign_text(make_client):
    fake = FakeClient(*[tool_call_completion(ANSWER, {"answer": "Привет"})] * (MAX_REPAIRS + 1))
    data = make_client(fake).post("/api/chat", json=chat_body("שלום, מה דעתך על מוט?")).json()["data"]
    assert data["reply"] == FALLBACK_REPLY["he"] and data["proposal"] is None


@pytest.mark.parametrize(("code", "status", "app_code"), [("insufficient_quota", 503, "AGENT_QUOTA"), ("rate_limit_exceeded", 429, "AGENT_BUSY")])
def test_openai_quota_and_rate_limit_are_distinct(make_client, code, status, app_code):
    import httpx2 as httpx
    from openai import RateLimitError

    error = RateLimitError("limit", response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body={"code": code})
    error.code = code
    response = make_client(FakeClient(error=error)).post("/api/chat", json=chat_body())
    assert (response.status_code, response.json()["error"]["code"]) == (status, app_code)


def test_per_ip_rate_limit_on_chat_and_apply(make_client, monkeypatch):
    from app.api.limits import limiter

    limiter.reset()
    monkeypatch.setenv("CHAT_RATE_LIMIT", "2/minute")
    get_settings.cache_clear()
    client = make_client(FakeClient(*[tool_call_completion(CLARIFY, {"question": "Which side?"})] * 3))
    codes = [client.post("/api/chat", json=chat_body()).status_code for _ in range(3)]
    limiter.reset()
    assert codes == [200, 200, 429]


def test_global_hourly_cap(make_client, monkeypatch):
    from app.api.agent import hourly_cap

    hourly_cap.reset()
    monkeypatch.setenv("CHAT_HOURLY_CAP", "2")
    get_settings.cache_clear()
    client = make_client(FakeClient(*[tool_call_completion(CLARIFY, {"question": "Which side?"})] * 3))
    codes = [client.post("/api/chat", json=chat_body()).status_code for _ in range(3)]
    hourly_cap.reset()
    assert codes == [200, 200, 429]


def test_oversized_body_is_413(make_client):
    big = {**chat_body(), "design": {"pad": "x" * 400_000}}
    assert make_client(FakeClient()).post("/api/chat", json=big).status_code == 413


def test_unexpected_errors_use_the_envelope_without_details(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    get_settings.cache_clear()

    def broken():
        raise RuntimeError("secret internal detail")

    app = create_app()
    app.dependency_overrides[get_llm_client] = broken
    response = TestClient(app, raise_server_exceptions=False).post("/api/chat", json=chat_body())
    get_settings.cache_clear()
    assert response.status_code == 500 and "secret" not in response.text
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"


def test_create_wardrobe_after_other_ops_is_sent_back(make_client):
    # Seen live: "make it 240 wide" came back as update_dimensions + create_wardrobe, which wiped every item and door.
    resize_then_replace = [
        {"op": "update_dimensions", "width": 2400},
        {"op": "create_wardrobe", "width": 2400, "height": 2400, "depth": 600, "compartmentCount": 3},
    ]
    fake = FakeClient(
        completion(calls=[tool_call(PROPOSE, propose(resize_then_replace), "call_a")]),
        completion(calls=[tool_call(PROPOSE, propose([{"op": "update_dimensions", "width": 2400}]), "call_b")]),
    )
    data = make_client(fake).post("/api/chat", json=chat_body("Make it 240 cm wide")).json()["data"]
    assert [op["op"] for op in data["proposal"]["ops"]] == ["update_dimensions"]
    repair = fake.requests[1]["messages"][-1]
    assert repair["tool_call_id"] == "call_a"
    assert "update_dimensions" in repair["content"]


def test_create_wardrobe_as_the_first_op_is_allowed(make_client):
    new_wardrobe = [{"op": "create_wardrobe", "width": 2400, "height": 2600, "depth": 600, "compartmentCount": 3}]
    fake = FakeClient(completion(calls=[tool_call(PROPOSE, propose(new_wardrobe))]))
    data = make_client(fake).post("/api/chat", json=chat_body("A new wardrobe, 240 wide and 260 tall")).json()["data"]
    assert data["proposal"]["ops"][0]["op"] == "create_wardrobe"


@pytest.mark.parametrize("ys", [[40, 80, 120, 160], [418]])  # seen live; 418 sits right on shf_l1 (400 + 18)
def test_shelves_stacked_too_close_are_sent_back(make_client, ys):
    crammed = [{"op": "add_shelf", "compartmentId": "cmp_left", "y": y} for y in ys]
    fake = FakeClient(
        completion(calls=[tool_call(PROPOSE, propose(crammed), "call_a")]),
        completion(calls=[tool_call(PROPOSE, propose([ADD_SHELF]), "call_b")]),
    )
    data = make_client(fake).post("/api/chat", json=chat_body()).json()["data"]
    assert data["proposal"]["ops"][0]["y"] == 1000
    assert "150 mm" in fake.requests[1]["messages"][-1]["content"]


def test_shelf_gap_is_configurable_and_in_the_prompt(make_client, monkeypatch):
    monkeypatch.setenv("MIN_SHELF_GAP_MM", "10")
    get_settings.cache_clear()
    close = {"op": "add_shelf", "compartmentId": "cmp_left", "y": 430}  # 12 mm above shf_l1
    fake = FakeClient(completion(calls=[tool_call(PROPOSE, propose([close]))]))
    data = make_client(fake).post("/api/chat", json=chat_body()).json()["data"]
    assert data["proposal"]["ops"][0]["y"] == 430
    assert "at least 10 mm" in fake.requests[0]["messages"][0]["content"]
