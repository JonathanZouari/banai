"""Hebrew / English: reply language, fixed refusal texts, Hebrew change cards and signed replies."""

import pytest
from fastapi.testclient import TestClient

from app.agent.language import FALLBACK_REPLY, OFF_TOPIC_REPLY, detect, reply_language
from app.agent.orchestrator import run_agent
from app.api.chat import get_agent_client
from app.api.limits import limiter
from app.config import Settings, get_settings
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.main import app
from app.services.signing import verify_reply
from tests.agent.fakes import FakeOpenAI, call, reply

KEY = "s" * 64
SETTINGS = Settings(openai_api_key="test", openai_chat_model="m", proposal_signing_key=KEY, chat_rate_limit="1000/minute")
http = TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    limiter.reset()
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    yield
    app.dependency_overrides.clear()


def body(text, language=None):
    payload = {"messages": [{"role": "user", "content": text}], "design": basic_wardrobe(), "revision": 1}
    if language:
        payload["language"] = language
    return payload


def test_detect_picks_the_script_and_hebrew_wins_in_mixed_text():
    assert detect("תוסיף מדף") == "he" and detect("add a shelf") == "en"
    assert detect("הוסף IKEA מדף") == "he" and detect("240?") is None


def test_the_latest_customer_message_decides_and_the_chat_language_is_the_fallback():
    history = [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}, {"role": "user", "content": "240?"}]
    assert reply_language(history, "he") == "he"
    assert reply_language([*history, {"role": "user", "content": "תודה"}], "en") == "he"


@pytest.mark.parametrize("text,language", [("מה מזג האוויר?", "he"), ("what is the weather?", "en")])
def test_an_off_topic_message_gets_the_fixed_refusal_in_its_language(text, language):
    client = FakeOpenAI(reply("It is sunny!", [call("decline_off_topic")]))
    result = run_agent(client, "m", basic_wardrobe(), [{"role": "user", "content": text}], load_catalog())
    assert result.reply == OFF_TOPIC_REPLY[language] and result.ops is None  # never the model's own words


def test_a_decline_next_to_real_changes_is_ignored():
    client = FakeOpenAI(reply("", [call("decline_off_topic", "call_0"), call("add_shelf", "call_1", compartmentId="cmp_middle", y=500)]))
    result = run_agent(client, "m", basic_wardrobe(), [{"role": "user", "content": "weather? add a shelf"}], load_catalog())
    assert [op["op"] for op in result.ops] == ["add_shelf"]


def test_the_prompt_ends_with_the_response_language():
    client = FakeOpenAI(reply("ok"))
    run_agent(client, "m", basic_wardrobe(), [{"role": "user", "content": "תוסיף מדף"}], load_catalog())
    assert client.requests[0]["messages"][0]["content"].rstrip().endswith("Write centimetres as ס\"מ. Translate catalog names (Walnut -> אגוז, White -> לבן).")
    client = FakeOpenAI(reply("ok"))
    run_agent(client, "m", basic_wardrobe(), [{"role": "user", "content": "240?"}], load_catalog(), language="en")
    assert client.requests[0]["messages"][0]["content"].rstrip().endswith("Write centimetres as cm.")


def test_the_fixed_fallback_follows_the_language_too():
    bad = reply("", [call("add_shelf", compartmentId="cmp_missing", y=500)])
    client = FakeOpenAI(bad, bad, bad)
    result = run_agent(client, "m", basic_wardrobe(), [{"role": "user", "content": "הוסף מדף"}], load_catalog())
    assert result.reply == FALLBACK_REPLY["he"]


def test_a_hebrew_request_gets_hebrew_change_cards_and_a_signed_reply():
    app.dependency_overrides[get_agent_client] = lambda: FakeOpenAI(reply("הוספתי מדף.", [call("add_shelf", compartmentId="cmp_middle", y=500)]))
    data = http.post("/api/chat", json=body("תוסיף מדף באמצע", "he")).json()["data"]
    assert data["proposal"]["summary"] == "שינוי אחד בארון שלך"
    assert data["proposal"]["changes"] == [{"title": "הוספת מדף", "detail": "בתא 2, 50 ס\"מ מהבסיס."}]
    assert verify_reply(data["reply"], data["replySignature"], KEY)


def test_english_stays_english_and_the_chat_language_covers_numbers_only_messages():
    app.dependency_overrides[get_agent_client] = lambda: FakeOpenAI(reply("Done.", [call("add_shelf", compartmentId="cmp_middle", y=500)]))
    data = http.post("/api/chat", json=body("add a shelf", "he")).json()["data"]  # the text wins over the chat language
    assert data["proposal"]["summary"] == "1 change to your wardrobe"
    app.dependency_overrides[get_agent_client] = lambda: FakeOpenAI(reply("", [call("add_shelf", compartmentId="cmp_middle", y=500)]))
    data = http.post("/api/chat", json=body("50", "he")).json()["data"]
    assert data["proposal"]["summary"] == "שינוי אחד בארון שלך"
    assert data["reply"] == "הנה מה שהייתי משנה. בדוק ואשר כדי להחיל."


def test_errors_use_the_requested_language():
    app.dependency_overrides[get_agent_client] = lambda: None
    message = http.post("/api/chat", json=body("שלום", "he")).json()["error"]["message"]
    assert message == "המעצב החכם עדיין לא מוגדר בשרת הזה."
    assert http.post("/api/chat", json=body("hello", "xx")).status_code == 422  # only he / en
