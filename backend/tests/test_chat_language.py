import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_chat import WIDTH_OPS, FakeClient, body, completion, make_client  # noqa: F401


def lang_body(language=None, text="make it 2400 wide"):
    payload = body(text)
    if language:
        payload["language"] = language
    return payload


def test_language_reaches_the_system_prompt_and_defaults_to_english(make_client):
    fake = FakeClient(completion("Done."), completion("שלום"))
    http = make_client(fake)
    http.post("/api/chat", json=lang_body())
    http.post("/api/chat", json=lang_body("he"))
    assert "ONLY in English" in fake.calls[0]["messages"][0]["content"]
    system = fake.calls[1]["messages"][0]["content"]
    assert "ONLY in Hebrew" in system and system.rstrip().endswith("unchanged.")


@pytest.mark.parametrize("language", ["ru", "EN", "", None, "he-IL"])
def test_unsupported_language_is_422(make_client, language):
    payload = {**body(), "language": language}
    assert make_client(FakeClient()).post("/api/chat", json=payload).status_code == 422


def test_russian_text_reply_is_retried(make_client):
    fake = FakeClient(completion("Конечно, готово."), completion("Sure, done."))
    data = make_client(fake).post("/api/chat", json=lang_body("en")).json()["data"]
    assert data["reply"] == "Sure, done." and len(fake.calls) == 2


def test_russian_summary_is_retried_then_signed(make_client):
    ru = {"summary": "Шире", "ops": WIDTH_OPS["ops"]}
    fake = FakeClient(completion("Хорошо", "propose_changes", ru), completion("Sure", "propose_changes", WIDTH_OPS))
    data = make_client(fake).post("/api/chat", json=lang_body("en")).json()["data"]
    assert data["proposal"]["summary"] == "Wider" and len(fake.calls) == 2


def test_persistent_wrong_language_falls_back_without_foreign_text(make_client):
    fake = FakeClient(*[completion("Привет")] * 3)
    data = make_client(fake).post("/api/chat", json=lang_body("he")).json()["data"]
    assert data["proposal"] is None and "Привет" not in data["reply"]
    assert any("א" <= ch <= "ת" for ch in data["reply"]) and len(fake.calls) == 3


def test_persistent_wrong_language_keeps_valid_ops_with_localized_summary(make_client):
    ru = {"summary": "Шире", "ops": WIDTH_OPS["ops"]}
    fake = FakeClient(*[completion("Хорошо", "propose_changes", ru)] * 3)
    data = make_client(fake).post("/api/chat", json=lang_body("en")).json()["data"]
    assert data["proposal"]["ops"] == WIDTH_OPS["ops"]
    assert data["proposal"]["summary"] == "Proposed design changes" and "Хорошо" not in data["reply"]


def test_russian_clarification_is_retried(make_client):
    fake = FakeClient(
        completion(None, "ask_clarification", {"question": "Какая ширина?"}),
        completion(None, "ask_clarification", {"question": "How wide?"}),
    )
    assert make_client(fake).post("/api/chat", json=lang_body("en")).json()["data"]["reply"] == "How wide?"


def test_hebrew_reply_passes_in_hebrew_mode_and_fails_in_english_mode(make_client):
    http = make_client(FakeClient(completion("בטח, 240 ס״מ (cm)."), *[completion("שלום")] * 3))
    assert http.post("/api/chat", json=lang_body("he")).json()["data"]["reply"] == "בטח, 240 ס״מ (cm)."
    english_mode = http.post("/api/chat", json=lang_body("en")).json()["data"]["reply"]
    assert "שלום" not in english_mode


def test_off_language_script_check():
    from app.ai.agent import off_language

    assert not off_language("Width 2400 mm, shelf_1 — ok!", "en")
    assert off_language("Привет", "en") and off_language("Привет", "he")
    assert off_language("مرحبا", "he") and off_language("你好", "en")
    assert off_language("שלום", "en") and not off_language("שלום 240 cm", "he")
    assert not off_language("", "en") and not off_language(None, "he")
