"""Customer accounts (email + password). The API talks to a provider, never to Supabase directly:
Supabase Auth (with the server-side secret key) in dev and production, an in-memory provider for tests
and local runs. The browser never talks to Supabase; it only holds the session tokens it is given."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import httpx2

from app.config import get_settings

# ASSUMPTION: a configurable default, matching Supabase's default access token lifetime.
SESSION_SECONDS = 3600


class AuthError(Exception):
    """A refusal the customer should see. `code` is one of the API error codes in app/api/auth.py."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AuthUnavailable(Exception):
    """The provider could not be reached or answered unexpectedly."""


@dataclass(frozen=True)
class User:
    id: str
    email: str


@dataclass(frozen=True)
class Session:
    user: User
    access_token: str
    refresh_token: str
    expires_in: int


class AuthProvider(Protocol):
    def sign_up(self, email: str, password: str, client_ip: str) -> tuple[User, Session | None]:
        """The new user, and a session unless the email must be confirmed first."""
        ...

    def sign_in(self, email: str, password: str, client_ip: str) -> Session: ...

    def refresh(self, refresh_token: str, client_ip: str) -> Session: ...

    def sign_out(self, access_token: str) -> None: ...

    def get_user(self, access_token: str) -> User | None:
        """The user behind a valid access token, else None."""
        ...


class InMemoryAuthProvider:
    """Accounts that live as long as the process. Passwords are scrypt-hashed even here."""

    def __init__(self) -> None:
        self._users: dict[str, tuple[User, bytes, bytes]] = {}  # email -> (user, salt, hash)
        self._access: dict[str, tuple[User, float]] = {}
        self._refresh: dict[str, User] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _hash(password: str, salt: bytes) -> bytes:
        return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)

    def _session(self, user: User) -> Session:
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self._lock:
            self._access = {**self._access, access: (user, time.monotonic() + SESSION_SECONDS)}
            self._refresh = {**self._refresh, refresh: user}
        return Session(user, access, refresh, SESSION_SECONDS)

    def sign_up(self, email: str, password: str, client_ip: str) -> tuple[User, Session | None]:
        salt = secrets.token_bytes(16)
        user = User(str(uuid.uuid4()), email)
        with self._lock:
            if email in self._users:
                raise AuthError("EMAIL_TAKEN")
            self._users = {**self._users, email: (user, salt, self._hash(password, salt))}
        return user, self._session(user)

    def sign_in(self, email: str, password: str, client_ip: str) -> Session:
        stored = self._users.get(email)
        # Hash even for an unknown email, so timing does not tell which emails have accounts.
        salt = stored[1] if stored else b"\0" * 16
        digest = self._hash(password, salt)
        if stored is None or not hmac.compare_digest(digest, stored[2]):
            raise AuthError("INVALID_CREDENTIALS")
        return self._session(stored[0])

    def refresh(self, refresh_token: str, client_ip: str) -> Session:
        with self._lock:
            user = self._refresh.get(refresh_token)
            # Single use, like Supabase's refresh token rotation.
            self._refresh = {key: value for key, value in self._refresh.items() if key != refresh_token}
        if user is None:
            raise AuthError("SESSION_EXPIRED")
        return self._session(user)

    def sign_out(self, access_token: str) -> None:
        with self._lock:
            entry = self._access.get(access_token)
            if entry is None:
                return
            user = entry[0]
            self._access = {key: value for key, value in self._access.items() if value[0] != user}
            self._refresh = {key: value for key, value in self._refresh.items() if value != user}

    def get_user(self, access_token: str) -> User | None:
        entry = self._access.get(access_token)
        return entry[0] if entry and entry[1] > time.monotonic() else None


# Supabase Auth error codes -> our API codes. Anything else is AuthUnavailable (a 503 without details).
SUPABASE_ERRORS = {
    "user_already_exists": "EMAIL_TAKEN",
    "email_exists": "EMAIL_TAKEN",
    "weak_password": "WEAK_PASSWORD",
    "invalid_credentials": "INVALID_CREDENTIALS",
    "email_not_confirmed": "EMAIL_NOT_CONFIRMED",
    "email_address_invalid": "INVALID_REQUEST",
    "validation_failed": "INVALID_REQUEST",
    "over_request_rate_limit": "RATE_LIMITED",
    "over_email_send_rate_limit": "RATE_LIMITED",
    "refresh_token_not_found": "SESSION_EXPIRED",
    "refresh_token_already_used": "SESSION_EXPIRED",
    "session_not_found": "SESSION_EXPIRED",
    "session_expired": "SESSION_EXPIRED",
}


class SupabaseAuthProvider:
    def __init__(self, url: str, secret_key: str, client: httpx2.Client | None = None) -> None:
        self._base = f"{url.rstrip('/')}/auth/v1"
        self._client = client or httpx2.Client(timeout=10)
        self._apikey = secret_key

    def _send(self, method: str, path: str, *, params: dict | None = None, json: dict | None = None,
              access_token: str | None = None, client_ip: str | None = None) -> httpx2.Response:
        headers = {"apikey": self._apikey}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        if client_ip:
            # All calls leave from this server; this lets Supabase rate-limit per customer instead.
            headers["Sb-Forwarded-For"] = client_ip
        try:
            return self._client.request(method, f"{self._base}{path}", params=params, json=json, headers=headers)
        except httpx2.HTTPError as exc:
            raise AuthUnavailable(f"Supabase Auth request failed: {type(exc).__name__}") from None

    @staticmethod
    def _body(response: httpx2.Response) -> dict:
        try:
            body = response.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            raise AuthUnavailable(f"Supabase Auth answered {response.status_code} without a JSON object")
        if response.status_code >= 400:
            code = SUPABASE_ERRORS.get(str(body.get("error_code") or body.get("error") or ""))
            if code is None and response.status_code == 429:
                code = "RATE_LIMITED"
            if code is None:
                raise AuthUnavailable(f"Supabase Auth answered {response.status_code}")
            raise AuthError(code)
        return body

    @staticmethod
    def _user(raw: object) -> User:
        if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("email"), str):
            raise AuthUnavailable("Supabase Auth returned an unexpected user")
        return User(raw["id"], raw["email"])

    def _session(self, body: dict) -> Session:
        access, refresh, expires = body.get("access_token"), body.get("refresh_token"), body.get("expires_in")
        if not (isinstance(access, str) and isinstance(refresh, str) and isinstance(expires, int)):
            raise AuthUnavailable("Supabase Auth returned an unexpected session")
        return Session(self._user(body.get("user")), access, refresh, expires)

    def sign_up(self, email: str, password: str, client_ip: str) -> tuple[User, Session | None]:
        # Created through the admin API, already confirmed: no confirmation email (decision 2026-10-23).
        # The customer logs in next. The API's own rate limits guard this endpoint (app/api/auth.py).
        body = self._body(self._send("POST", "/admin/users", json={"email": email, "password": password,
                                                                  "email_confirm": True},
                                     access_token=self._apikey))
        return self._user(body), None

    def sign_in(self, email: str, password: str, client_ip: str) -> Session:
        response = self._send("POST", "/token", params={"grant_type": "password"},
                              json={"email": email, "password": password}, client_ip=client_ip)
        return self._session(self._body(response))

    def refresh(self, refresh_token: str, client_ip: str) -> Session:
        response = self._send("POST", "/token", params={"grant_type": "refresh_token"},
                              json={"refresh_token": refresh_token}, client_ip=client_ip)
        return self._session(self._body(response))

    def sign_out(self, access_token: str) -> None:
        response = self._send("POST", "/logout", params={"scope": "local"}, access_token=access_token)
        if response.status_code >= 500:
            raise AuthUnavailable(f"Supabase Auth answered {response.status_code}")
        # 401/403/404: the session is already gone, which is what logging out wants.

    def get_user(self, access_token: str) -> User | None:
        response = self._send("GET", "/user", access_token=access_token)
        if response.status_code in (401, 403):
            return None
        return self._user(self._body(response))


@lru_cache
def _local_provider() -> InMemoryAuthProvider:
    return InMemoryAuthProvider()


@lru_cache
def _supabase_provider(url: str, secret_key: str) -> SupabaseAuthProvider:
    return SupabaseAuthProvider(url, secret_key)


def get_auth_provider() -> AuthProvider | None:
    """Supabase when configured; in-memory accounts for local and E2E runs; otherwise None (accounts are off)."""
    settings = get_settings()
    if settings.storage_enabled:
        return _supabase_provider(settings.supabase_url.strip(), settings.supabase_secret_key.strip())
    if settings.app_env in ("local", "e2e"):
        return _local_provider()
    return None
