"""DoS guards on the unauthenticated AI endpoints: the request body cap and the concurrency slots."""

import asyncio
import json
import threading
import time

import pytest
from fastapi.testclient import TestClient

from app.agent.chat import ChatResult
from app.ai.verify import Verification
from app.api import ai_settings, chat
from app.api.ai_settings import get_verifier
from app.api.chat import get_chat_runner
from app.body_limit import MAX_BODY_BYTES, BodySizeLimitMiddleware
from app.config import get_settings
from app.main import app

KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ"
CHAT = ("/api/chat", {"apiKey": KEY, "messages": [{"role": "user", "content": "hi"}]})
VERIFY = ("/api/settings/ai/verify", {"apiKey": KEY})


@pytest.fixture
def calls():
    """Both AI endpoints with fakes in place of OpenAI; returns the list of calls they received."""
    received = []
    app.dependency_overrides[get_chat_runner] = lambda: lambda *args: received.append(args) or ChatResult("ok", "m")
    app.dependency_overrides[get_verifier] = lambda: lambda *args: received.append(args) or Verification("connected", "m")
    yield received
    app.dependency_overrides.clear()


@pytest.mark.parametrize(("path", "body"), [CHAT, VERIFY])
def test_an_oversized_body_is_refused_before_the_endpoint_runs(calls, path, body):
    padded = json.dumps({**body, "padding": "x" * MAX_BODY_BYTES})
    origin = get_settings().cors_origin_list[0]
    response = TestClient(app).post(path, content=padded, headers={"Content-Type": "application/json", "Origin": origin})
    assert response.status_code == 413
    assert response.json() == {"success": False, "data": None, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "The request is too large."}}
    assert response.headers["access-control-allow-origin"] == origin  # the browser can read the error
    assert calls == []


def test_the_largest_valid_chat_request_fits_under_the_cap(calls):
    # 40 messages of 2000 characters, each \u-escaped as a surrogate pair: the worst case for a valid body.
    body = json.dumps({"apiKey": KEY, "messages": [{"role": "user", "content": "😀" * 2000}] * 40}, ensure_ascii=True)
    assert 900_000 < len(body) < MAX_BODY_BYTES
    response = TestClient(app).post("/api/chat", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 200
    assert len(calls[0][1]) == 40


def _run(chunks, headers=()):
    """Drives a 10-byte cap with a body sent in `chunks`; returns (bodies the app saw, messages sent)."""
    incoming = [{"type": "http.request", "body": c, "more_body": i < len(chunks) - 1} for i, c in enumerate(chunks)]
    seen, sent = [], []

    async def inner(scope, receive, send):
        seen.append((await receive())["body"])
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return incoming.pop(0)

    async def send(message):
        sent.append(message)

    scope = {"type": "http", "method": "POST", "path": "/api/chat", "headers": list(headers)}
    asyncio.run(BodySizeLimitMiddleware(inner, max_bytes=10)(scope, receive, send))
    return seen, sent


def test_a_chunked_body_over_the_cap_is_refused_without_a_content_length():
    seen, sent = _run([b"123456", b"78901"])
    assert seen == []
    assert sent[0]["status"] == 413


def test_a_body_within_the_cap_reaches_the_app_unchanged():
    seen, sent = _run([b"12345", b"67890"], headers=[(b"content-length", b"10")])
    assert seen == [b"1234567890"]
    assert sent[0]["status"] == 200


@pytest.mark.parametrize(("module", "slots", "path", "body"), [(chat, "_slots", *CHAT), (ai_settings, "_verify_slots", *VERIFY)])
def test_a_full_endpoint_answers_busy_at_once_instead_of_holding_a_worker_thread(calls, monkeypatch, module, slots, path, body):
    full = threading.BoundedSemaphore(1)
    full.acquire()
    monkeypatch.setattr(module, slots, full)
    started = time.monotonic()
    response = TestClient(app).post(path, json=body)
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "BUSY"
    assert time.monotonic() - started < 1  # it used to wait 2 s (chat) or 15 s (verify) for a slot
    assert calls == []


@pytest.mark.parametrize(("module", "slots", "path", "body"), [(chat, "_slots", *CHAT), (ai_settings, "_verify_slots", *VERIFY)])
def test_a_slot_is_released_after_each_request(calls, monkeypatch, module, slots, path, body):
    monkeypatch.setattr(module, slots, threading.BoundedSemaphore(1))
    client = TestClient(app)
    assert [client.post(path, json=body).status_code for _ in range(3)] == [200, 200, 200]
    assert len(calls) == 3
