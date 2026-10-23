"""/api/projects (ADR-042): create, open, save with a revision, delete; the token rules; the store's failures;
and the Supabase repo against a fake PostgREST (no network)."""

import json

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.api import projects
from app.config import get_settings
from app.domain.defaults import basic_wardrobe
from app.main import app
from app.store import MemoryRepo, StorageError, SupabaseRepo, storage_mode

client = TestClient(app)
CUSTOMER = {"name": "דנה לוי", "phone": "052-1234567", "city": "ירושלים", "floor": 3, "elevator": False}


@pytest.fixture(autouse=True)
def memory_store(monkeypatch):
    """Every test gets a fresh in-memory store and a clean creation counter."""
    monkeypatch.setenv("STORAGE", "memory")
    get_settings.cache_clear()
    from app import store

    monkeypatch.setattr(store, "_memory", MemoryRepo())
    projects._creates.clear()
    projects._ip_hits.clear()
    projects._ip_creates.clear()
    yield
    get_settings.cache_clear()


def create(name="חדר שינה", design=None, customer=None):
    body = {"name": name, "design": basic_wardrobe() if design is None else design}
    if customer is not None:
        body["customer"] = customer
    return client.post("/api/projects", json=body)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_returns_an_id_a_token_and_revision_one():
    response = create(customer=CUSTOMER)
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["revision"] == 1 and len(data["token"]) == 43 and len(data["id"]) == 36
    assert response.headers["cache-control"] == "no-store"


def test_open_with_the_token_returns_the_project_with_its_customer():
    made = create(customer=CUSTOMER).json()["data"]
    response = client.get(f"/api/projects/{made['id']}", headers=auth(made["token"]))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "חדר שינה" and data["revision"] == 1
    assert data["design"] == basic_wardrobe()
    assert data["customer"]["name"] == "דנה לוי" and data["customer"]["floor"] == 3
    # Written as the browser writes it: camelCase keys, only what is set. It saves back without change.
    assert data["customer"] == {"name": "דנה לוי", "phone": "052-1234567", "city": "ירושלים", "floor": 3, "elevator": False}
    again = client.put(f"/api/projects/{made['id']}", json={"name": "חדר שינה", "design": data["design"], "customer": data["customer"]},
                       headers={**auth(made["token"]), "If-Match": "1"})
    assert again.status_code == 200
    assert "token" not in data and "token_hash" not in data


def test_a_project_without_customer_details_stores_none():
    made = create(customer={}).json()["data"]
    assert client.get(f"/api/projects/{made['id']}", headers=auth(made["token"])).json()["data"]["customer"] is None


@pytest.mark.parametrize("headers", [{}, auth("x" * 43), auth("short"), {"Authorization": "Basic abc"}])
def test_a_wrong_missing_or_malformed_token_is_the_same_404_as_an_unknown_id(headers):
    made = create().json()["data"]
    wrong = client.get(f"/api/projects/{made['id']}", headers=headers)
    unknown = client.get("/api/projects/6f1c0d7e-0000-4000-8000-000000000000", headers=auth(made["token"]))
    assert wrong.status_code == unknown.status_code == 404
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"]["code"] == "NOT_FOUND"


def test_a_token_only_opens_its_own_project():
    one, two = create().json()["data"], create().json()["data"]
    assert client.get(f"/api/projects/{two['id']}", headers=auth(one["token"])).status_code == 404


def test_a_malformed_id_is_a_404():
    assert client.get("/api/projects/not-a-uuid", headers=auth("x" * 43)).status_code == 404
    assert client.put("/api/projects/not-a-uuid", json={"name": "a", "design": {}}, headers={**auth("x" * 43), "If-Match": "1"}).status_code == 404
    assert client.delete("/api/projects/not-a-uuid", headers=auth("x" * 43)).status_code == 404


def test_save_over_the_current_revision_bumps_it_and_stale_is_409():
    made = create().json()["data"]
    url = f"/api/projects/{made['id']}"
    design = basic_wardrobe()
    design["dimensions"]["height"] = 2300
    saved = client.put(url, json={"name": "חדר שינה 2", "design": design, "customer": CUSTOMER}, headers={**auth(made["token"]), "If-Match": "1"})
    assert saved.status_code == 200 and saved.json()["data"] == {"revision": 2}
    stale = client.put(url, json={"name": "x", "design": design}, headers={**auth(made["token"]), "If-Match": "1"})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "STALE"
    opened = client.get(url, headers=auth(made["token"])).json()["data"]
    assert opened["revision"] == 2 and opened["name"] == "חדר שינה 2" and opened["design"]["dimensions"]["height"] == 2300
    assert opened["customer"]["name"] == "דנה לוי"


def test_save_needs_if_match_and_a_valid_token():
    made = create().json()["data"]
    url = f"/api/projects/{made['id']}"
    body = {"name": "a", "design": basic_wardrobe()}
    assert client.put(url, json=body, headers=auth(made["token"])).status_code == 428
    assert client.put(url, json=body, headers={**auth(made["token"]), "If-Match": "abc"}).status_code == 428
    assert client.put(url, json=body, headers={**auth("y" * 43), "If-Match": "1"}).status_code == 404


def test_delete_removes_the_project_and_needs_the_token():
    made = create().json()["data"]
    url = f"/api/projects/{made['id']}"
    assert client.delete(url, headers=auth("y" * 43)).status_code == 404
    assert client.delete(url, headers=auth(made["token"])).json()["data"] == {"deleted": True}
    assert client.get(url, headers=auth(made["token"])).status_code == 404


def test_an_invalid_design_is_a_422_with_the_engine_error_and_nothing_is_stored():
    design = basic_wardrobe()
    design["dimensions"]["width"] = 5
    response = create(design=design)
    assert response.status_code == 422 and response.json()["error"]["code"]
    from app import store

    assert store._memory.count() == 0


def test_a_huge_design_is_refused_before_pydantic_reads_it():
    response = create(design={f"k{i}": i for i in range(30_000)})
    assert response.status_code == 422 and response.json()["error"]["message"] == "the design is too large"


@pytest.mark.parametrize("name", ["", "a" * 61, "bad‮name", "tab\tname"])
def test_the_name_is_safe_text_of_at_most_60_characters(name):
    assert create(name=name).status_code == 422


def test_camel_case_customer_fields_are_kept_with_their_names():
    made = create(customer={"contactTimes": "אחה״צ", "installDate": "2026-12-01", "notes": "קומה 3"}).json()["data"]
    stored = client.get(f"/api/projects/{made['id']}", headers=auth(made["token"])).json()["data"]["customer"]
    assert stored == {"contactTimes": "אחה״צ", "installDate": "2026-12-01", "notes": "קומה 3"}


def test_the_customer_is_validated_like_the_dossier_one():
    assert create(customer={"name": "x", "extra": 1}).status_code == 422
    assert create(customer={"phone": "not a phone"}).status_code == 422


def test_a_response_never_echoes_the_request():
    response = create(name="חדר", design={"secret-marker-xyz": 1})
    assert response.status_code == 422 and "secret-marker-xyz" not in response.text


def test_new_projects_are_limited_per_hour(monkeypatch):
    monkeypatch.setattr(projects, "CREATES_PER_HOUR", 2)
    assert create().status_code == 201 and create().status_code == 201
    third = create()
    assert third.status_code == 429 and third.json()["error"]["code"] == "RATE_LIMITED"


def test_the_creation_window_slides(monkeypatch):
    monkeypatch.setattr(projects, "CREATES_PER_HOUR", 1)
    assert projects._creating_allowed(now=0.0) and not projects._creating_allowed(now=10.0)
    assert projects._creating_allowed(now=3700.0)


def test_a_full_store_refuses_new_projects(monkeypatch):
    monkeypatch.setattr(projects, "MAX_STORED_DESIGNS", 1)
    assert create().status_code == 201
    full = create()
    assert full.status_code == 503 and full.json()["error"]["code"] == "STORAGE_FULL"


def test_without_a_store_every_route_says_so(monkeypatch):
    monkeypatch.setenv("STORAGE", "off")
    get_settings.cache_clear()
    response = create()
    assert response.status_code == 503 and response.json()["error"]["code"] == "STORAGE_OFF"
    assert client.get("/api/projects/6f1c0d7e-0000-4000-8000-000000000000", headers=auth("x" * 43)).json()["error"]["code"] == "STORAGE_OFF"


def test_a_failing_store_is_a_503_that_names_nothing(monkeypatch):
    class Broken(MemoryRepo):
        def count(self):
            raise StorageError("status 500: SECRET-DETAIL")

    from app import store

    monkeypatch.setattr(store, "_memory", Broken())
    response = create(customer=CUSTOMER)
    assert response.status_code == 503 and response.json()["error"]["code"] == "STORAGE_UNAVAILABLE"
    assert "SECRET-DETAIL" not in response.text


def test_a_busy_server_does_not_queue(monkeypatch):
    for _ in range(8):
        assert projects._slots.acquire(blocking=False)
    try:
        response = create()
        assert response.status_code == 429 and response.json()["error"]["code"] == "BUSY"
    finally:
        for _ in range(8):
            projects._slots.release()


def test_the_body_cap_applies():
    big = {"name": "a", "design": basic_wardrobe(), "customer": {"notes": "x" * 2_000_000}}
    assert client.post("/api/projects", json=big).status_code == 413


def test_health_says_whether_saving_to_the_server_is_available(monkeypatch):
    assert client.get("/api/health").json()["data"]["storage"] is True
    monkeypatch.setenv("STORAGE", "off")
    get_settings.cache_clear()
    assert client.get("/api/health").json()["data"]["storage"] is False


def test_storage_mode_is_automatic_from_the_supabase_settings(monkeypatch):
    for key in ("STORAGE", "SUPABASE_URL", "SUPABASE_SECRET_KEY"):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    settings = get_settings().model_copy(update={"supabase_url": "", "supabase_secret_key": "", "storage": "auto"})
    assert storage_mode(settings) == "off"
    assert storage_mode(settings.model_copy(update={"supabase_url": "https://x.supabase.co", "supabase_secret_key": "k"})) == "supabase"
    assert storage_mode(settings.model_copy(update={"storage": "memory"})) == "memory"


# ---- SupabaseRepo against a fake PostgREST ------------------------------------------------------------------


class FakePostgrest:
    """Just enough of the `designs` table: insert, select by id, patch by id and revision, delete, count."""

    def __init__(self):
        self.rows, self.calls, self.fail = {}, [], False

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.calls.append(request)
        if self.fail:
            return httpx2.Response(500, json={"message": "boom"})
        params = dict(request.url.params)
        body = json.loads(request.content) if request.content else None
        if request.method == "POST":
            row = {"id": f"id-{len(self.rows) + 1}", "revision": 1, **body}
            self.rows[row["id"]] = row
            return httpx2.Response(201, json=[row])
        if request.method == "GET" and params.get("select") == "id" and "id" not in params:
            return httpx2.Response(200, json=list(self.rows.values())[:1], headers={"content-range": f"0-0/{len(self.rows)}"})
        if request.method == "DELETE" and "updated_at" in params:  # the purge
            cutoff = params["updated_at"].removeprefix("lt.")
            for key in [k for k, r in self.rows.items() if r.get("updated_at", "9") < cutoff]:
                del self.rows[key]
            return httpx2.Response(204)
        wanted = params["id"].removeprefix("eq.")
        row = self.rows.get(wanted)
        if request.method == "GET":
            return httpx2.Response(200, json=[row] if row else [])
        if request.method == "PATCH":
            if row is None or row["revision"] != int(params["revision"].removeprefix("eq.")):
                return httpx2.Response(200, json=[])
            row.update(body)
            return httpx2.Response(200, json=[row])
        if request.method == "DELETE":
            return httpx2.Response(200, json=[self.rows.pop(wanted)] if row else [])
        return httpx2.Response(405)


@pytest.fixture
def supa():
    fake = FakePostgrest()
    client_ = httpx2.Client(base_url="https://x.supabase.co/rest/v1", transport=httpx2.MockTransport(fake),
                            headers={"apikey": "k", "Authorization": "Bearer k"})
    return SupabaseRepo("https://x.supabase.co", "k", client=client_), fake


def test_the_supabase_repo_creates_reads_saves_and_deletes(supa):
    repo, fake = supa
    row = repo.create(token_hash="a" * 64, name="n", design={"d": 1}, customer={"name": "x"})
    assert row["revision"] == 1 and repo.count() == 1
    got = repo.get(row["id"])
    assert got["token_hash"] == "a" * 64 and got["design"] == {"d": 1}
    assert repo.update(row["id"], 1, name="m", design={"d": 2}, customer=None) == 2
    assert repo.update(row["id"], 1, name="stale", design={"d": 3}, customer=None) is None  # someone saved first
    assert repo.get(row["id"])["name"] == "m"
    patch = [c for c in fake.calls if c.method == "PATCH"][0]
    assert "revision=eq.1" in str(patch.url) and patch.headers["prefer"] == "return=representation"
    assert repo.delete(row["id"]) is True and repo.get(row["id"]) is None and repo.delete(row["id"]) is False


def test_the_supabase_repo_turns_failures_into_a_storage_error_without_the_response(supa):
    repo, fake = supa
    fake.fail = True
    with pytest.raises(StorageError) as raised:
        repo.get("id-1")
    assert "boom" not in str(raised.value)

    def unreachable(_request):
        raise httpx2.ConnectError("secret-host-detail")

    down = SupabaseRepo("https://x.supabase.co", "k", client=httpx2.Client(base_url="https://x.supabase.co/rest/v1", transport=httpx2.MockTransport(unreachable)))
    with pytest.raises(StorageError) as raised:
        down.count()
    assert "secret-host-detail" not in str(raised.value)


def test_a_blank_storage_setting_means_auto(monkeypatch):
    """.env.example ships `STORAGE=` empty; that must not stop the server from starting."""
    monkeypatch.setenv("STORAGE", "")
    get_settings.cache_clear()
    assert get_settings().storage == "auto"


# ---- the security review's fixes (2026-10-20) ------------------------------------------------------------------


def test_one_address_is_limited_on_every_route(monkeypatch):
    monkeypatch.setattr(projects, "REQUESTS_PER_MINUTE_PER_IP", 3)
    projects._ip_hits.clear()
    unknown = "/api/projects/6f1c0d7e-0000-4000-8000-000000000000"
    codes = [client.get(unknown, headers=auth("x" * 43)).status_code for _ in range(5)]
    assert codes == [404, 404, 404, 429, 429]
    projects._ip_hits.clear()


def test_one_address_may_only_create_so_many_projects_an_hour(monkeypatch):
    monkeypatch.setattr(projects, "CREATES_PER_HOUR_PER_IP", 2)
    projects._ip_hits.clear()
    projects._ip_creates.clear()
    assert create().status_code == 201 and create().status_code == 201
    third = create()
    assert third.status_code == 429 and third.json()["error"]["code"] == "RATE_LIMITED"
    projects._ip_hits.clear()
    projects._ip_creates.clear()


def test_the_limit_window_slides_per_address():
    bucket: dict = {}
    assert projects._within(bucket, "a", 1, 60.0, 0.0) and not projects._within(bucket, "a", 1, 60.0, 30.0)
    assert projects._within(bucket, "b", 1, 60.0, 30.0)  # another address has its own count
    assert projects._within(bucket, "a", 1, 60.0, 70.0)


def test_behind_a_trusted_proxy_the_address_is_the_one_the_proxy_appended(monkeypatch):
    from types import SimpleNamespace

    request = SimpleNamespace(headers={"x-forwarded-for": "6.6.6.6, 203.0.113.9"}, client=SimpleNamespace(host="10.0.0.1"))
    assert projects._client_ip(request) == "10.0.0.1"  # not trusted: the socket's peer
    monkeypatch.setenv("TRUST_PROXY", "true")
    get_settings.cache_clear()
    assert projects._client_ip(request) == "203.0.113.9"  # the last entry cannot be spoofed by the client


def test_a_design_that_is_too_big_as_json_is_refused():
    design = basic_wardrobe()
    design["padding"] = "x" * 400_000
    response = create(design=design)
    assert response.status_code == 422 and response.json()["error"]["message"] == "the design is too large"


def test_a_save_without_the_token_never_parses_the_design(monkeypatch):
    made = create().json()["data"]
    calls = []
    monkeypatch.setattr(projects, "parse_design", lambda design: calls.append(design))
    response = client.put(f"/api/projects/{made['id']}", json={"name": "a", "design": basic_wardrobe()},
                          headers={**auth("y" * 43), "If-Match": "1"})
    assert response.status_code == 404 and calls == []


def test_the_service_key_only_goes_over_https_or_to_this_machine():
    from app.store import _safe_url

    assert _safe_url("https://x.supabase.co") and _safe_url("http://localhost:54321") and _safe_url("http://127.0.0.1:54321")
    assert not _safe_url("http://x.supabase.co") and not _safe_url("ftp://x") and not _safe_url("x.supabase.co")
    settings = get_settings().model_copy(update={"supabase_url": "http://x.supabase.co", "supabase_secret_key": "k", "storage": "auto"})
    assert storage_mode(settings) == "off"


def test_memory_storage_is_never_on_in_production():
    settings = get_settings().model_copy(update={"storage": "memory", "app_env": "production"})
    assert storage_mode(settings) == "off"
    assert storage_mode(settings.model_copy(update={"app_env": "local"})) == "memory"


def test_a_reply_without_a_revision_is_a_storage_error_not_a_crash(supa, monkeypatch):
    repo, _fake = supa
    monkeypatch.setattr(repo, "_call", lambda *args, **kwargs: httpx2.Response(200, json=[{"id": "x"}]))
    with pytest.raises(StorageError):
        repo.update("x", 1, name="n", design={}, customer=None)


# ---- expiry: 180 days after the last save ------------------------------------------------------------------


def _later(monkeypatch, days):
    from datetime import UTC, datetime, timedelta

    from app import store

    now = datetime.now(UTC) + timedelta(days=days)  # from the real clock, so two calls do not add up
    monkeypatch.setattr(store, "utcnow", lambda: now)
    monkeypatch.setattr(projects, "utcnow", lambda: now)


def test_a_project_not_saved_for_180_days_opens_like_an_unknown_link(monkeypatch):
    made = create().json()["data"]
    auth = {"Authorization": f"Bearer {made['token']}"}
    _later(monkeypatch, 179)
    assert client.get(f"/api/projects/{made['id']}", headers=auth).status_code == 200
    _later(monkeypatch, 181)
    gone = client.get(f"/api/projects/{made['id']}", headers=auth)
    assert gone.status_code == 404 and gone.json()["error"]["code"] == "NOT_FOUND"


def test_a_save_restarts_the_180_days(monkeypatch):
    made = create().json()["data"]
    auth = {"Authorization": f"Bearer {made['token']}"}
    _later(monkeypatch, 170)
    saved = client.put(f"/api/projects/{made['id']}", headers={**auth, "If-Match": "1"},
                       json={"name": "n", "design": basic_wardrobe()})
    assert saved.status_code == 200
    _later(monkeypatch, 300)  # 130 days after the save
    assert client.get(f"/api/projects/{made['id']}", headers=auth).status_code == 200


def test_a_new_project_purges_the_expired_ones(monkeypatch):
    from app import store

    old = create().json()["data"]
    _later(monkeypatch, 200)
    create()
    assert store._memory.get(old["id"]) is None and store._memory.count() == 1


def test_the_supabase_repo_purges_by_the_last_save(supa):
    from datetime import UTC, datetime

    repo, fake = supa
    fake.rows["old"] = {"id": "old", "revision": 1, "updated_at": "2026-01-01T00:00:00+00:00"}
    fake.rows["new"] = {"id": "new", "revision": 1, "updated_at": "2026-09-01T00:00:00+00:00"}
    repo.purge(datetime(2026, 4, 1, tzinfo=UTC))
    call = [c for c in fake.calls if c.method == "DELETE"][-1]
    assert call.url.params["updated_at"] == "lt.2026-04-01T00:00:00Z"
    assert set(fake.rows) == {"new"}


def test_a_row_without_a_readable_time_has_not_expired():
    from app.store import expired

    assert not expired({}) and not expired({"updated_at": "not a time"})
    assert expired({"updated_at": "2020-01-01T00:00:00+00:00"})


def test_a_failed_purge_does_not_block_a_new_project(monkeypatch):
    from app import store

    def broken(_before):
        raise StorageError("status 500")

    monkeypatch.setattr(store._memory, "purge", broken)
    assert create().status_code == 201

