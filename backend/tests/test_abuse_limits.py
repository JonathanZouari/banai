"""Abuse guards from the merge security review: body caps for chunked requests, rate limits on saving
designs and on the carpenter PDF, a global ceiling on new designs, and the client address behind a proxy."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api import designs as designs_api
from app.api.limits import client_ip
from app.config import get_settings
from app.domain.defaults import basic_wardrobe
from app.main import create_app
from app.persistence.repository import InMemoryRepository


@pytest.fixture
def make_client(monkeypatch):
    """A fresh app with the given settings, saving to an in-memory store (never Supabase)."""
    repository = InMemoryRepository()
    monkeypatch.setattr(designs_api, "get_repository", lambda: repository)

    def build(**env):
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        get_settings.cache_clear()
        return TestClient(create_app())

    yield build
    get_settings.cache_clear()


def chunks(total: int, size: int = 16_384):
    """A generator body: TestClient sends it chunked, with no Content-Length header."""
    for start in range(0, total, size):
        yield b"x" * min(size, total - start)


def test_a_chunked_body_over_the_cap_is_413_not_read_to_the_end(make_client):
    client = make_client()
    for path in ("/api/chat", "/api/proposals/apply", "/api/voice/speech"):
        response = client.post(path, content=chunks(400_000), headers={"Content-Type": "application/json"})
        assert response.status_code == 413, path
        assert response.json()["error"]["code"] == "BODY_TOO_LARGE"


def test_a_chunked_body_under_the_cap_reaches_the_route(make_client):
    client = make_client(OPENAI_API_KEY="")
    response = client.post("/api/chat", content=chunks(2_000), headers={"Content-Type": "application/json"})
    assert response.status_code != 413  # parsed by the route (invalid JSON here), not cut off


def test_a_413_still_carries_cors_headers(make_client):
    client = make_client(CORS_ORIGINS="http://app.test")
    response = client.post("/api/chat", content=chunks(400_000),
                           headers={"Content-Type": "application/json", "Origin": "http://app.test"})
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://app.test"


def test_saving_designs_is_rate_limited_per_client(make_client):
    client = make_client(DESIGNS_RATE_LIMIT="2/minute")
    codes = [client.post("/api/designs", json={"design": basic_wardrobe()}).status_code for _ in range(3)]
    assert codes == [201, 201, 429]


def test_new_designs_have_a_global_hourly_ceiling(make_client):
    client = make_client(DESIGNS_HOURLY_CAP="2")
    responses = [client.post("/api/designs", json={"design": basic_wardrobe(), "language": "en"}) for _ in range(3)]
    assert [r.status_code for r in responses] == [201, 201, 429]
    assert responses[2].json()["error"]["code"] == "BUSY"


def test_reopening_designs_is_rate_limited_too(make_client):
    client = make_client(DESIGNS_RATE_LIMIT="2/minute")
    path = "/api/designs/00000000-0000-4000-8000-000000000000"
    codes = [client.get(path, headers={"Authorization": f"Bearer {'A' * 43}"}).status_code for _ in range(3)]
    assert codes == [404, 404, 429]


def test_the_carpenter_pdf_is_rate_limited(make_client):
    client = make_client(EXPORT_RATE_LIMIT="1/minute")
    first = client.post("/api/export/pdf", json={"design": basic_wardrobe(), "language": "en"})
    second = client.post("/api/export/pdf", json={"design": basic_wardrobe(), "language": "en"})
    assert first.status_code == 200 and second.status_code == 429


def request_from(address: str, forwarded: str | None) -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded is not None else []
    return Request({"type": "http", "headers": headers, "client": (address, 1234)})


@pytest.mark.parametrize(("hops", "forwarded", "expected"), [
    (0, "203.0.113.9", "10.0.0.1"),  # off: the connecting address, whatever the header says
    (1, "203.0.113.9", "203.0.113.9"),  # one trusted proxy: the address it saw
    (1, "6.6.6.6, 203.0.113.9", "203.0.113.9"),  # a spoofed entry stays on the left and is ignored
    (2, "6.6.6.6, 203.0.113.9, 10.1.1.1", "203.0.113.9"),  # two proxies
    (1, None, "10.0.0.1"),  # no header: fall back to the connecting address
    (2, "203.0.113.9", "10.0.0.1"),  # fewer entries than proxies: not trusted
])
def test_client_address_behind_trusted_proxies(monkeypatch, hops, forwarded, expected):
    monkeypatch.setenv("FORWARDED_HOPS", str(hops))
    get_settings.cache_clear()
    try:
        assert client_ip(request_from("10.0.0.1", forwarded)) == expected
    finally:
        get_settings.cache_clear()


def test_the_rate_limit_keys_on_the_forwarded_client(make_client):
    client = make_client(FORWARDED_HOPS="1", DESIGNS_RATE_LIMIT="1/minute")
    save = lambda address: client.post("/api/designs", json={"design": basic_wardrobe()},  # noqa: E731
                                       headers={"X-Forwarded-For": address}).status_code
    assert [save("203.0.113.9"), save("203.0.113.9"), save("198.51.100.7")] == [201, 429, 201]


def test_a_second_forwarded_line_is_read_too(monkeypatch):
    # A client sends its own X-Forwarded-For line and the proxy adds another line rather than appending.
    monkeypatch.setenv("FORWARDED_HOPS", "1")
    get_settings.cache_clear()
    request = Request({"type": "http", "client": ("10.0.0.1", 1234),
                       "headers": [(b"x-forwarded-for", b"6.6.6.6"), (b"x-forwarded-for", b"203.0.113.9")]})
    try:
        assert client_ip(request) == "203.0.113.9"
    finally:
        get_settings.cache_clear()


def test_new_designs_have_a_daily_size_budget(make_client):
    size = len(json.dumps(basic_wardrobe(), separators=(",", ":")))
    client = make_client(DESIGNS_DAILY_BYTES=str(size * 2))
    codes = [client.post("/api/designs", json={"design": basic_wardrobe()}).status_code for _ in range(3)]
    assert codes == [201, 201, 429]
