import hashlib
import json
import uuid

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.api import designs as designs_api
from app.auth.provider import InMemoryAuthProvider
from app.config import get_settings
from app.domain.defaults import basic_wardrobe
from app.main import app
from app.persistence import repository as repo_module
from app.persistence.repository import InMemoryRepository, StorageError, SupabaseRepository

client = TestClient(app)


ACCOUNTS = InMemoryAuthProvider()
SESSION = ACCOUNTS.sign_up("saver@example.com", "a-long-password", "127.0.0.1")[1]
LOGGED_IN = {"Authorization": f"Bearer {SESSION.access_token}"}


@pytest.fixture(autouse=True)
def accounts(monkeypatch):
    monkeypatch.setattr(auth_api, "get_auth_provider", lambda: ACCOUNTS)
    return ACCOUNTS


@pytest.fixture
def store(monkeypatch):
    repository = InMemoryRepository()
    monkeypatch.setattr(designs_api, "get_repository", lambda: repository)
    return repository


def save(design=None, headers=LOGGED_IN, **extra):
    return client.post("/api/designs", json={"design": design or basic_wardrobe(), **extra}, headers=headers)


def bearer(token):
    """The link token header (named for the old Authorization scheme it replaced)."""
    return {"X-Design-Token": token}


def put(url, body, headers):
    return client.put(url, json=body, headers={**LOGGED_IN, **headers})


def test_create_returns_a_link_and_stores_only_the_token_hash(store):
    response = save(name="Bedroom")
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["revision"] == 1 and len(data["accessToken"]) == 43
    saved = store.get(data["designId"])
    assert saved.token_hash == hashlib.sha256(data["accessToken"].encode()).hexdigest()
    assert data["accessToken"] not in json.dumps(saved.__dict__)
    assert saved.name == "Bedroom"


def test_reopen_with_the_token_returns_the_design_uncached(store):
    data = save().json()["data"]
    assert save().headers["Cache-Control"] == "no-store"  # the response carries the token
    response = client.get(f"/api/designs/{data['designId']}", headers=bearer(data["accessToken"]))
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    body = response.json()["data"]
    assert body["design"] == basic_wardrobe() and body["revision"] == 1 and body["name"] == "Wardrobe"


@pytest.mark.parametrize("headers", [{}, bearer("A" * 43), {"Authorization": "Bearer " + "A" * 43}, bearer("short")])
def test_missing_or_wrong_token_is_not_found(store, headers):
    design_id = save().json()["data"]["designId"]
    response = client.get(f"/api/designs/{design_id}", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("design_id", ["not-a-uuid", str(uuid.uuid4())])
def test_unknown_or_malformed_ids_are_not_found(store, design_id):
    assert client.get(f"/api/designs/{design_id}", headers=bearer("A" * 43)).status_code == 404


def test_save_bumps_the_revision_and_a_stale_save_is_409(store):
    data = save().json()["data"]
    url, auth = f"/api/designs/{data['designId']}", bearer(data["accessToken"])
    changed = {**basic_wardrobe(), "dimensions": {**basic_wardrobe()["dimensions"], "height": 2300}}
    first = put(url, {"design": changed}, {**auth, "If-Match": "1"})
    assert first.status_code == 200 and first.json()["data"]["revision"] == 2
    stale = put(url, {"design": basic_wardrobe(), "language": "en"}, {**auth, "If-Match": "1"})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "STALE"
    assert client.get(url, headers=auth).json()["data"]["design"]["dimensions"]["height"] == 2300


def test_save_needs_the_token_and_a_revision(store):
    data = save().json()["data"]
    url = f"/api/designs/{data['designId']}"
    body = {"design": basic_wardrobe()}
    assert put(url, body, {**bearer("B" * 43), "If-Match": "1"}).status_code == 404
    assert put(url, body, bearer(data["accessToken"])).status_code == 422
    for bad in ("0", "²".encode("latin-1"), "1" * 12, "-1"):  # a raw client can send any latin-1 byte
        assert put(url, body, {**bearer(data["accessToken"]), "If-Match": bad}).status_code == 422


def test_invalid_designs_and_requests_are_rejected(store):
    broken = {**basic_wardrobe(), "dimensions": {"width": -1, "height": 2400, "depth": 600}}
    assert save(broken).status_code == 422
    assert save(extra_field=1).status_code == 422
    assert save(name="bad\x00name").status_code == 422
    assert client.post("/api/designs", content=b"{not json", headers=LOGGED_IN).status_code == 422
    assert store._rows == {}


def test_oversized_bodies_are_rejected_before_parsing(store):
    response = client.post("/api/designs", content=b"x" * (designs_api.MAX_BODY_BYTES + 1), headers=LOGGED_IN)
    assert response.status_code == 413


def test_saving_is_off_without_storage(monkeypatch):
    monkeypatch.setattr(designs_api, "get_repository", lambda: None)
    response = save()
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "STORAGE_UNAVAILABLE"


def test_storage_failures_are_a_503_without_details(monkeypatch):
    class Broken(InMemoryRepository):
        def create(self, *args):
            raise StorageError("Supabase answered 500")

    monkeypatch.setattr(designs_api, "get_repository", lambda: Broken())
    response = save()
    assert response.status_code == 503
    assert "Supabase" not in response.text


def test_the_default_design_route_still_wins_over_saved_ids():
    assert client.get("/api/designs/default").status_code == 200


# --- Supabase repository: the exact PostgREST calls ---------------------------------------------

def supabase(handler):
    return SupabaseRepository("https://x.supabase.co/", "sb_secret_test", httpx2.Client(transport=httpx2.MockTransport(handler)))


def test_supabase_create_sends_the_secret_key_and_returns_the_row():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(201, json=[{"id": "abc", "revision": 1}])

    assert supabase(handler).create("f" * 64, "Wardrobe", {"a": 1}, "usr-1") == ("abc", 1)
    request = seen[0]
    assert request.method == "POST" and request.url.path == "/rest/v1/designs"
    assert request.headers["apikey"] == "sb_secret_test"
    assert request.headers["Prefer"] == "return=representation"
    assert json.loads(request.content) == {"token_hash": "f" * 64, "name": "Wardrobe", "design": {"a": 1}, "owner_id": "usr-1"}


def test_supabase_update_is_filtered_by_id_token_and_revision():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json=[])

    assert supabase(handler).update("abc", "f" * 64, 3, "n", {}) is None  # no row matched: stale
    params = dict(seen[0].url.params)
    assert params["id"] == "eq.abc" and params["token_hash"] == f"eq.{'f' * 64}" and params["revision"] == "eq.3"
    assert json.loads(seen[0].content)["revision"] == 4


def test_supabase_get_returns_none_for_no_rows():
    assert supabase(lambda request: httpx2.Response(200, json=[])).get("abc") is None


@pytest.mark.parametrize("handler", [
    lambda request: httpx2.Response(500, json={"message": "boom"}),
    lambda request: httpx2.Response(200, json={"not": "a list"}),
    lambda request: httpx2.Response(200, text="<html>gateway</html>"),
    lambda request: httpx2.Response(200, json=[{"id": "abc"}]),  # a row without the expected columns
])
def test_supabase_errors_become_storage_errors(handler):
    with pytest.raises(StorageError):
        supabase(handler).get("abc")


def test_supabase_network_errors_become_storage_errors():
    def handler(request):
        raise httpx2.ConnectError("down", request=request)

    with pytest.raises(StorageError):
        supabase(handler).get("abc")


@pytest.mark.parametrize("env, url, key, expected", [
    ("local", "", "", InMemoryRepository),
    ("dev", "", "", type(None)),
    ("dev", "https://x.supabase.co", "sb_secret_x", SupabaseRepository),
])
def test_get_repository_picks_the_store_from_settings(monkeypatch, env, url, key, expected):
    monkeypatch.setenv("APP_ENV", env)
    monkeypatch.setenv("SUPABASE_URL", url)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", key)
    get_settings.cache_clear()
    try:
        assert isinstance(repo_module.get_repository(), expected)
    finally:
        get_settings.cache_clear()


# --- Accounts: saving needs a logged-in customer; opening a link does not --------------------------

def test_saving_records_the_owner(store):
    data = save().json()["data"]
    assert store.get(data["designId"]).owner_id == SESSION.user.id


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer " + "x" * 40}, {"Authorization": "Basic abc"}])
def test_saving_without_a_valid_session_is_401(store, headers):
    response = save(headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert store._rows == {}


def test_saving_over_a_link_also_needs_a_session(store):
    data = save().json()["data"]
    url = f"/api/designs/{data['designId']}"
    response = client.put(url, json={"design": basic_wardrobe()}, headers={**bearer(data["accessToken"]), "If-Match": "1"})
    assert response.status_code == 401
    assert store.get(data["designId"]).revision == 1


def test_a_guest_can_still_open_a_link(store):
    data = save().json()["data"]
    response = client.get(f"/api/designs/{data['designId']}", headers=bearer(data["accessToken"]))
    assert response.status_code == 200


def test_the_session_is_not_a_link_token(store):
    """A logged-in customer still needs the link token to open or change someone's design."""
    data = save().json()["data"]
    url = f"/api/designs/{data['designId']}"
    assert client.get(url, headers=LOGGED_IN).status_code == 404
    assert put(url, {"design": basic_wardrobe()}, {"If-Match": "1"}).status_code == 404


def test_an_auth_outage_is_a_503(store, monkeypatch):
    class Down(InMemoryAuthProvider):
        def get_user(self, access_token):
            from app.auth.provider import AuthUnavailable
            raise AuthUnavailable("down")

    monkeypatch.setattr(auth_api, "get_auth_provider", lambda: Down())
    assert save().status_code == 503
