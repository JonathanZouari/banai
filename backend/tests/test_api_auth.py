"""Accounts PROTOTYPE: sign-up/sign-in through the backend and the signed-in user's designs."""

import json

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.api import designs as designs_api
from app.api import my_designs as my_designs_api
from app.auth.provider import AuthError, AuthUnavailable, InMemoryAuth, SupabaseAuth
from app.domain.defaults import basic_wardrobe
from app.main import app
from app.persistence.repository import InMemoryRepository

client = TestClient(app)
PASSWORD = "correct horse"


@pytest.fixture
def provider(monkeypatch):
    accounts = InMemoryAuth()
    monkeypatch.setattr(auth_api, "get_auth", lambda: accounts)
    for limiter in auth_api.LIMITERS:
        limiter.reset()
    yield accounts
    for limiter in auth_api.LIMITERS:
        limiter.reset()


@pytest.fixture
def store(monkeypatch):
    repository = InMemoryRepository()
    monkeypatch.setattr(designs_api, "get_repository", lambda: repository)
    monkeypatch.setattr(my_designs_api, "get_repository", lambda: repository)
    return repository


def sign_up(email="dana@example.com", password=PASSWORD, **extra):
    return client.post("/api/auth/signup", json={"email": email, "password": password, **extra})


def sign_in(email="dana@example.com", password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def session_of(response):
    return response.json()["data"]


# --- sign-up / sign-in --------------------------------------------------------------------------

def test_sign_up_signs_in_and_me_returns_the_user(provider):
    response = sign_up(email="  Dana@Example.com ")
    assert response.status_code == 201
    assert response.headers["Cache-Control"] == "no-store"
    data = session_of(response)
    assert data["user"]["email"] == "dana@example.com"  # normalized
    me = client.get("/api/auth/me", headers=bearer(data["accessToken"]))
    assert me.status_code == 200 and me.json()["data"]["user"] == data["user"]


def test_sign_in_with_the_right_password(provider):
    sign_up()
    response = sign_in(email="DANA@example.com")
    assert response.status_code == 200
    assert session_of(response)["user"]["email"] == "dana@example.com"


@pytest.mark.parametrize("email,password", [("dana@example.com", "wrong password"), ("nobody@example.com", PASSWORD)])
def test_wrong_password_and_unknown_email_get_the_same_answer(provider, email, password):
    sign_up()
    response = sign_in(email, password)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_a_taken_email_is_a_generic_failure(provider):
    sign_up()
    response = sign_up(password="another password")
    assert response.status_code == 400 and response.json()["error"]["code"] == "SIGNUP_FAILED"


@pytest.mark.parametrize("body,code", [
    ({"email": "not-an-email", "password": PASSWORD}, "INVALID_EMAIL"),
    ({"email": "a@b.co\u0000", "password": PASSWORD}, "INVALID_EMAIL"),
    ({"email": "a@b.co", "password": "short"}, "WEAK_PASSWORD"),
    ({"email": "a@b.co", "password": "x" * 73}, "WEAK_PASSWORD"),
    ({"email": "a@b.co", "password": PASSWORD, "admin": True}, "INVALID_REQUEST"),
    ({"email": "a" * 300 + "@b.co", "password": PASSWORD}, "INVALID_REQUEST"),
    ({"email": "a@b.co"}, "INVALID_REQUEST"),
])
def test_sign_up_validates_the_input(provider, body, code):
    response = client.post("/api/auth/signup", json=body)
    assert response.status_code == 422 and response.json()["error"]["code"] == code


def test_errors_follow_the_requested_language(provider):
    response = sign_up(email="bad", language="en")
    assert response.json()["error"]["message"] == "Enter a valid email address."


def test_oversized_bodies_are_rejected(provider):
    response = client.post("/api/auth/login", content=json.dumps({"email": "a@b.co", "password": "x" * 10_000}))
    assert response.status_code == 422


def test_refresh_rotates_the_refresh_token(provider):
    first = session_of(sign_up())
    response = client.post("/api/auth/refresh", json={"refreshToken": first["refreshToken"]})
    assert response.status_code == 200
    second = session_of(response)
    assert second["accessToken"] != first["accessToken"]
    reused = client.post("/api/auth/refresh", json={"refreshToken": first["refreshToken"]})
    assert reused.status_code == 401


def test_logout_ends_the_session(provider):
    data = session_of(sign_up())
    assert client.post("/api/auth/logout", headers=bearer(data["accessToken"])).status_code == 200
    assert client.get("/api/auth/me", headers=bearer(data["accessToken"])).status_code == 401
    assert client.post("/api/auth/refresh", json={"refreshToken": data["refreshToken"]}).status_code == 401


@pytest.mark.parametrize("headers", [{}, bearer("not-a-real-token-at-all"), {"Authorization": "Basic abc"}])
def test_me_needs_a_valid_token(provider, headers):
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401 and response.json()["error"]["code"] == "UNAUTHORIZED"


def test_password_guessing_is_rate_limited_per_email(provider):
    sign_up()
    codes = [sign_in(password=f"guess number {i}").status_code for i in range(auth_api.LOGIN_PER_EMAIL._limit + 1)]
    assert codes[:-1] == [401] * auth_api.LOGIN_PER_EMAIL._limit
    assert codes[-1] == 429
    assert sign_in().status_code == 429  # even the right password, until the window passes


def test_accounts_are_off_without_a_provider(monkeypatch):
    monkeypatch.setattr(auth_api, "get_auth", lambda: None)
    assert sign_in().status_code == 503
    assert client.get("/api/auth/me", headers=bearer("x" * 40)).json()["error"]["code"] == "ACCOUNTS_UNAVAILABLE"


def test_an_unreachable_provider_is_a_503_without_details(monkeypatch):
    class Down(InMemoryAuth):
        def sign_in(self, email, password):
            raise AuthUnavailable("Supabase Auth answered 500")

    monkeypatch.setattr(auth_api, "get_auth", lambda: Down())
    auth_api.LOGIN_PER_CLIENT.reset()
    auth_api.LOGIN_PER_EMAIL.reset()
    response = sign_in()
    assert response.status_code == 503 and "Supabase" not in response.text


# --- my designs ----------------------------------------------------------------------------------

def signed_in_user(email="dana@example.com"):
    return bearer(session_of(sign_up(email=email))["accessToken"])


def test_a_signed_in_save_is_listed_reopened_and_still_has_a_link(provider, store):
    auth = signed_in_user()
    created = client.post("/api/me/designs", json={"design": basic_wardrobe(), "name": "Bedroom"}, headers=auth)
    assert created.status_code == 201
    data = created.json()["data"]
    listed = client.get("/api/me/designs", headers=auth).json()["data"]["designs"]
    assert [(d["designId"], d["name"], d["revision"]) for d in listed] == [(data["designId"], "Bedroom", 1)]
    opened = client.get(f"/api/me/designs/{data['designId']}", headers=auth)
    assert opened.status_code == 200 and opened.json()["data"]["design"] == basic_wardrobe()
    # The private link keeps working for sharing.
    shared = client.get(f"/api/designs/{data['designId']}", headers=bearer(data["accessToken"]))
    assert shared.status_code == 200


def test_owner_saves_bump_the_revision_and_stale_saves_are_409(provider, store):
    auth = signed_in_user()
    design_id = client.post("/api/me/designs", json={"design": basic_wardrobe()}, headers=auth).json()["data"]["designId"]
    url = f"/api/me/designs/{design_id}"
    first = client.put(url, json={"design": basic_wardrobe()}, headers={**auth, "If-Match": "1"})
    assert first.status_code == 200 and first.json()["data"]["revision"] == 2
    stale = client.put(url, json={"design": basic_wardrobe()}, headers={**auth, "If-Match": "1"})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "STALE"


def test_another_users_design_is_not_found(provider, store):
    owner = signed_in_user("dana@example.com")
    other = signed_in_user("eli@example.com")
    design_id = client.post("/api/me/designs", json={"design": basic_wardrobe()}, headers=owner).json()["data"]["designId"]
    assert client.get("/api/me/designs", headers=other).json()["data"]["designs"] == []
    assert client.get(f"/api/me/designs/{design_id}", headers=other).status_code == 404
    put = client.put(f"/api/me/designs/{design_id}", json={"design": basic_wardrobe()}, headers={**other, "If-Match": "1"})
    assert put.status_code == 404
    assert store.get(design_id).revision == 1


def test_a_link_only_design_is_not_anyones(provider, store):
    auth = signed_in_user()
    design_id = client.post("/api/designs", json={"design": basic_wardrobe()}).json()["data"]["designId"]
    assert client.get(f"/api/me/designs/{design_id}", headers=auth).status_code == 404
    assert client.get("/api/me/designs", headers=auth).json()["data"]["designs"] == []


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/me/designs"), ("POST", "/api/me/designs"),
    ("GET", "/api/me/designs/0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10"),
    ("PUT", "/api/me/designs/0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10"),
])
def test_my_designs_need_a_session(provider, store, method, path):
    response = client.request(method, path, json={"design": basic_wardrobe()}, headers={"If-Match": "1"})
    assert response.status_code == 401


def test_my_designs_validate_the_design(provider, store):
    auth = signed_in_user()
    bad = {**basic_wardrobe(), "dimensions": {"width": 1, "height": 1, "depth": 1}}
    assert client.post("/api/me/designs", json={"design": bad}, headers=auth).status_code == 422


# --- Supabase Auth: the exact GoTrue calls --------------------------------------------------------

USER = {"id": "0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10", "email": "dana@example.com"}
SESSION = {"access_token": "a" * 40, "refresh_token": "r" * 20, "expires_in": 3600, "user": USER}


def gotrue(handler):
    return SupabaseAuth("https://x.supabase.co/", "sb_publishable_test", httpx2.Client(transport=httpx2.MockTransport(handler)))


def test_supabase_sign_in_calls_the_password_grant_with_the_publishable_key():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json=SESSION)

    session = gotrue(handler).sign_in("dana@example.com", PASSWORD)
    request = seen[0]
    assert str(request.url) == "https://x.supabase.co/auth/v1/token?grant_type=password"
    assert request.headers["apikey"] == "sb_publishable_test"
    assert json.loads(request.content) == {"email": "dana@example.com", "password": PASSWORD}
    assert session.user.id == USER["id"] and session.access_token == "a" * 40


def test_supabase_sign_up_without_a_session_means_confirm_by_email():
    result = gotrue(lambda request: httpx2.Response(200, json=USER)).sign_up("dana@example.com", PASSWORD)
    assert result.session is None


def test_supabase_get_user_sends_the_users_token_and_caches_it():
    calls = []

    def handler(request):
        calls.append(request.headers["Authorization"])
        return httpx2.Response(200, json=USER)

    provider = gotrue(handler)
    assert provider.get_user("t" * 40).email == "dana@example.com"
    assert provider.get_user("t" * 40).email == "dana@example.com"
    assert calls == [f"Bearer {'t' * 40}"]


@pytest.mark.parametrize("status,expected", [(400, AuthError), (401, AuthError), (429, AuthUnavailable), (500, AuthUnavailable)])
def test_supabase_errors_are_mapped(status, expected):
    provider = gotrue(lambda request: httpx2.Response(status, json={"msg": "user dana@example.com not found"}))
    with pytest.raises(expected) as caught:
        provider.sign_in("dana@example.com", PASSWORD)
    assert "dana" not in str(caught.value)


def test_supabase_unexpected_bodies_are_unavailable():
    with pytest.raises(AuthUnavailable):
        gotrue(lambda request: httpx2.Response(200, json={"access_token": "x"})).sign_in("a@b.co", PASSWORD)


def test_supabase_network_errors_are_unavailable():
    def handler(request):
        raise httpx2.ConnectError("boom")

    with pytest.raises(AuthUnavailable):
        gotrue(handler).get_user("t" * 40)


# --- Supabase repository: the owner queries -----------------------------------------------------

def postgrest(handler):
    from app.persistence.repository import SupabaseRepository
    return SupabaseRepository("https://x.supabase.co/", "sb_secret_test", httpx2.Client(transport=httpx2.MockTransport(handler)))


def test_supabase_list_owned_filters_by_owner_newest_first():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json=[{"id": "d1", "name": "Bedroom", "revision": 2, "updated_at": "2026-10-23T10:00:00Z"}])

    listed = postgrest(handler).list_owned(USER["id"], 100)
    params = dict(seen[0].url.params)
    assert params == {"owner_id": f"eq.{USER['id']}", "select": "id,name,revision,updated_at",
                      "order": "updated_at.desc", "limit": "100"}
    assert listed[0].design_id == "d1" and listed[0].revision == 2


def test_supabase_update_owned_is_filtered_by_id_owner_and_revision():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json=[{"revision": 3}])

    assert postgrest(handler).update_owned("d1", USER["id"], 2, "Bedroom", {"x": 1}) == 3
    params = dict(seen[0].url.params)
    assert seen[0].method == "PATCH"
    assert params["id"] == "eq.d1" and params["owner_id"] == f"eq.{USER['id']}" and params["revision"] == "eq.2"


def test_supabase_create_sends_the_owner_only_when_signed_in():
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx2.Response(201, json=[{"id": "d1", "revision": 1}])

    repository = postgrest(handler)
    repository.create("h" * 64, "W", {}, USER["id"])
    repository.create("h" * 64, "W", {})
    assert bodies[0]["owner_id"] == USER["id"] and "owner_id" not in bodies[1]
