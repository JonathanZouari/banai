import pytest
from fastapi.testclient import TestClient

from app.ai.verify import Verification
from app.api.ai_settings import get_verifier
from app.main import app

VALID_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ"


@pytest.fixture
def client_with(request):
    """A client whose OpenAI check returns the given status and records its calls."""
    calls = []

    def make(status):
        def fake(api_key, model):
            calls.append((api_key, model))
            return Verification(status, model)

        app.dependency_overrides[get_verifier] = lambda: fake
        return TestClient(app), calls

    yield make
    app.dependency_overrides.clear()


@pytest.mark.parametrize("status", ["connected", "invalid_key", "model_unavailable", "unreachable"])
def test_verify_reports_the_openai_status_and_only_a_masked_key(client_with, status):
    client, calls = client_with(status)
    response = client.post("/api/settings/ai/verify", json={"apiKey": f"  {VALID_KEY}\n"})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == status
    assert data["maskedKey"] == "sk-...WXYZ"
    assert VALID_KEY not in response.text
    assert calls == [(VALID_KEY, None)]


@pytest.mark.parametrize("bad", ["", "hello", "sk-short", "pk-abcdefghijklmnopqrstuvwxyz", "sk-abc def ghi jkl mno pqr", "sk-<script>alert(1)</script>xx"])
def test_malformed_keys_are_rejected_without_calling_openai(client_with, bad):
    client, calls = client_with("connected")
    response = client.post("/api/settings/ai/verify", json={"apiKey": bad})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_FORMAT"
    assert calls == []


def test_oversized_body_is_rejected(client_with):
    client, calls = client_with("connected")
    assert client.post("/api/settings/ai/verify", json={"apiKey": "sk-" + "a" * 600}).status_code == 422
    assert calls == []


def test_configured_model_is_checked(client_with, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("OPENAI_CHAT_MODEL", "some-model")
    get_settings.cache_clear()
    try:
        client, calls = client_with("connected")
        response = client.post("/api/settings/ai/verify", json={"apiKey": VALID_KEY})
        assert response.json()["data"]["model"] == "some-model"
        assert calls == [(VALID_KEY, "some-model")]
    finally:
        get_settings.cache_clear()


def test_verify_is_post_only():
    assert TestClient(app).get("/api/settings/ai/verify").status_code == 405
