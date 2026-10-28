import json

import httpx2
import pytest
from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.auth.provider import AuthError, AuthUnavailable, InMemoryAuthProvider, SupabaseAuthProvider
from app.auth.ratelimit import RateLimiter
from app.main import app

client = TestClient(app)
PASSWORD = "a-long-password"


@pytest.fixture(autouse=True)
def accounts(monkeypatch):
    provider = InMemoryAuthProvider()
    monkeypatch.setattr(auth_api, "get_auth_provider", lambda: provider)
    # Fresh limits per test, so one test's attempts never count against another's.
    monkeypatch.setattr(auth_api, "ip_limiter", RateLimiter(lambda: 1000))
    monkeypatch.setattr(auth_api, "email_limiter", RateLimiter(lambda: 1000))
    return provider


def sign_up(email="dana@example.com", password=PASSWORD, **extra):
    return client.post("/api/auth/signup", json={"email": email, "password": password, **extra})


def log_in(email="dana@example.com", password=PASSWORD, **extra):
    return client.post("/api/auth/login", json={"email": email, "password": password, **extra})


def test_sign_up_creates_the_account_without_logging_in():
    response = sign_up()
    assert response.status_code == 201
    assert response.headers["Cache-Control"] == "no-store"
    data = response.json()["data"]
    assert data["user"]["email"] == "dana@example.com" and data["confirmationRequired"] is False
    assert "accessToken" not in data and "refreshToken" not in data  # the customer logs in next
    assert PASSWORD not in response.text
    assert log_in().status_code == 200


def test_emails_are_normalised():
    sign_up(email="  Dana@Example.COM ".strip())
    assert log_in(email="dana@example.com").status_code == 200


def test_the_same_email_cannot_sign_up_twice():
    sign_up()
    response = sign_up(language="en")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_TAKEN"


def test_log_in_and_wrong_password_or_unknown_email_get_one_answer():
    sign_up()
    assert log_in().status_code == 200
    wrong = log_in(password="not-the-password")
    unknown = log_in(email="nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.parametrize("email", ["", "no-at-sign", "a@b", "a b@example.com", "a@example.com\x00", "x" * 250 + "@ex.com"])
def test_invalid_emails_are_rejected(email):
    response = sign_up(email=email)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_EMAIL"


@pytest.mark.parametrize("password", ["short", "x" * 73, "eight\x00chars"])
def test_weak_or_malformed_passwords_are_rejected(password):
    response = sign_up(password=password)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "WEAK_PASSWORD"


@pytest.mark.parametrize("body", [b"{not json", b"[]", json.dumps({"email": "a@example.com", "password": PASSWORD, "x": 1}).encode()])
def test_malformed_requests_are_rejected(body):
    assert client.post("/api/auth/login", content=body).status_code == 422


def test_oversized_bodies_are_rejected():
    assert client.post("/api/auth/login", content=b"x" * (auth_api.MAX_BODY_BYTES + 1)).status_code == 422


def test_messages_follow_the_language():
    sign_up()
    assert "incorrect" in log_in(password="wrong-password", language="en").json()["error"]["message"]
    assert "שגויים" in log_in(password="wrong-password").json()["error"]["message"]


def test_refresh_rotates_the_refresh_token():
    sign_up()
    old = log_in().json()["data"]["refreshToken"]
    response = client.post("/api/auth/refresh", json={"refreshToken": old})
    assert response.status_code == 200 and response.json()["data"]["refreshToken"] != old
    reused = client.post("/api/auth/refresh", json={"refreshToken": old})
    assert reused.status_code == 401 and reused.json()["error"]["code"] == "SESSION_EXPIRED"


@pytest.mark.parametrize("token", ["", "short", "bad token with spaces"])
def test_a_malformed_refresh_token_is_an_expired_session(token):
    response = client.post("/api/auth/refresh", json={"refreshToken": token})
    assert response.status_code == 401


def test_log_out_ends_the_session(accounts):
    sign_up()
    data = log_in().json()["data"]
    assert accounts.get_user(data["accessToken"]) is not None
    response = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {data['accessToken']}"})
    assert response.status_code == 200
    assert accounts.get_user(data["accessToken"]) is None
    assert client.post("/api/auth/refresh", json={"refreshToken": data["refreshToken"]}).status_code == 401


def test_log_out_without_a_session_is_fine():
    assert client.post("/api/auth/logout").status_code == 200


def test_accounts_are_off_without_a_provider(monkeypatch):
    monkeypatch.setattr(auth_api, "get_auth_provider", lambda: None)
    response = sign_up()
    assert response.status_code == 503 and response.json()["error"]["code"] == "AUTH_UNAVAILABLE"


def test_provider_outages_are_a_503_without_details(monkeypatch):
    class Down(InMemoryAuthProvider):
        def sign_in(self, *args):
            raise AuthUnavailable("Supabase Auth answered 500 at https://secret.supabase.co")

    monkeypatch.setattr(auth_api, "get_auth_provider", lambda: Down())
    response = log_in()
    assert response.status_code == 503 and "supabase" not in response.text.lower()


def test_attempts_are_limited_per_ip(monkeypatch):
    monkeypatch.setattr(auth_api, "ip_limiter", RateLimiter(lambda: 3))
    codes = [log_in(email=f"user{i}@example.com").status_code for i in range(4)]
    assert codes == [401, 401, 401, 429]


def test_attempts_are_limited_per_email(monkeypatch):
    monkeypatch.setattr(auth_api, "email_limiter", RateLimiter(lambda: 2))
    sign_up()  # one attempt
    assert log_in(password="wrong-password-1").status_code == 401
    response = log_in()
    assert response.status_code == 429 and response.json()["error"]["code"] == "RATE_LIMITED"


# --- Rate limiter and client IP ---------------------------------------------------------------

def test_the_window_slides():
    now = [0.0]
    limiter = RateLimiter(lambda: 2, window=10, clock=lambda: now[0])
    assert limiter.allow("k") and limiter.allow("k") and not limiter.allow("k")
    now[0] = 10.5
    assert limiter.allow("k")


def test_the_proxy_hop_is_the_client_ip(monkeypatch):
    seen = []
    real = auth_api.client_ip
    monkeypatch.setattr(auth_api, "client_ip", lambda request: seen.append(real(request)) or seen[-1])
    client.post("/api/auth/login", json={"email": "a@example.com", "password": PASSWORD},
                headers={"X-Forwarded-For": "6.6.6.6, 203.0.113.9"})
    assert seen == ["203.0.113.9"]  # the forged first hop is ignored


# --- Supabase Auth provider: the exact calls --------------------------------------------------

def supabase(handler):
    return SupabaseAuthProvider("https://x.supabase.co/", "sb_secret_test", httpx2.Client(transport=httpx2.MockTransport(handler)))


SESSION_BODY = {"access_token": "a" * 40, "refresh_token": "r" * 12, "expires_in": 3600,
                "user": {"id": "usr-1", "email": "dana@example.com"}}


def test_supabase_sign_in_uses_the_password_grant_and_forwards_the_ip():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json=SESSION_BODY)

    session = supabase(handler).sign_in("dana@example.com", PASSWORD, "203.0.113.9")
    request = seen[0]
    assert request.url.path == "/auth/v1/token" and request.url.params["grant_type"] == "password"
    assert request.headers["apikey"] == "sb_secret_test" and "Authorization" not in request.headers
    assert request.headers["Sb-Forwarded-For"] == "203.0.113.9"
    assert session.user.id == "usr-1" and session.access_token == "a" * 40


def test_supabase_sign_up_creates_a_confirmed_user_through_the_admin_api():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json={"id": "usr-1", "email": "d@example.com"})

    user, session = supabase(handler).sign_up("d@example.com", PASSWORD, "1.2.3.4")
    assert user.id == "usr-1" and session is None  # the customer logs in next
    request = seen[0]
    assert request.method == "POST" and request.url.path == "/auth/v1/admin/users"
    assert request.headers["Authorization"] == "Bearer sb_secret_test"
    assert json.loads(request.content) == {"email": "d@example.com", "password": PASSWORD, "email_confirm": True}


def test_supabase_get_user_sends_the_customer_token():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(200, json={"id": "usr-1", "email": "d@example.com"})

    assert supabase(handler).get_user("t" * 40).id == "usr-1"
    assert seen[0].headers["Authorization"] == f"Bearer {'t' * 40}" and seen[0].url.path == "/auth/v1/user"


def test_supabase_get_user_with_a_bad_token_is_none():
    assert supabase(lambda request: httpx2.Response(401, json={"msg": "invalid JWT"})).get_user("t" * 40) is None


@pytest.mark.parametrize("status, body, code", [
    (400, {"error_code": "invalid_credentials"}, "INVALID_CREDENTIALS"),
    (422, {"error_code": "user_already_exists"}, "EMAIL_TAKEN"),
    (400, {"error_code": "email_not_confirmed"}, "EMAIL_NOT_CONFIRMED"),
    (429, {"error_code": "something_new"}, "RATE_LIMITED"),
    (400, {"error_code": "refresh_token_already_used"}, "SESSION_EXPIRED"),
])
def test_supabase_refusals_map_to_api_codes(status, body, code):
    with pytest.raises(AuthError) as raised:
        supabase(lambda request: httpx2.Response(status, json=body)).sign_in("d@example.com", PASSWORD, "1.2.3.4")
    assert raised.value.code == code


@pytest.mark.parametrize("handler", [
    lambda request: httpx2.Response(500, json={"msg": "boom"}),
    lambda request: httpx2.Response(200, text="<html>gateway</html>"),
    lambda request: httpx2.Response(200, json={"access_token": "a"}),  # a session missing fields
    lambda request: httpx2.Response(400, json={"error_code": "unknown_thing"}),
])
def test_supabase_surprises_are_unavailable(handler):
    with pytest.raises(AuthUnavailable):
        supabase(handler).sign_in("d@example.com", PASSWORD, "1.2.3.4")


def test_supabase_network_errors_are_unavailable():
    def handler(request):
        raise httpx2.ConnectError("down", request=request)

    with pytest.raises(AuthUnavailable):
        supabase(handler).get_user("t" * 40)
