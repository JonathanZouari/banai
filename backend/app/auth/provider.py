"""Accounts PROTOTYPE (branch feature/auth; accounts are excluded from the MVP scope in CLAUDE.md).

Email + password sign-in. The API talks to an AuthProvider, never to Supabase directly: Supabase Auth
(GoTrue, called by the backend with the publishable key) when configured, an in-memory provider for
tests and local runs. The browser never talks to Supabase."""

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

ACCESS_TOKEN_SECONDS = 3600  # ASSUMPTION: matches Supabase's default JWT expiry; in-memory provider only
USER_CACHE_SECONDS = 60  # a verified access token is trusted this long before asking Supabase again
USER_CACHE_MAX = 2_000


class AuthError(Exception):
    """Wrong credentials, an invalid/expired token, or a rejected sign-up. Never says which."""


class AuthUnavailable(Exception):
    """The auth service could not be reached or answered unexpectedly."""


@dataclass(frozen=True)
class User:
    id: str
    email: str


@dataclass(frozen=True)
class Session:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User


@dataclass(frozen=True)
class SignUpResult:
    session: Session | None  # None when the account must first be confirmed by email


class AuthProvider(Protocol):
    def sign_up(self, email: str, password: str) -> SignUpResult: ...

    def sign_in(self, email: str, password: str) -> Session: ...

    def refresh(self, refresh_token: str) -> Session: ...

    def sign_out(self, access_token: str) -> None: ...

    def get_user(self, access_token: str) -> User:
        """The user behind a valid access token; AuthError otherwise."""
        ...


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class InMemoryAuth:
    """Local and E2E runs only: accounts vanish on restart, nothing is emailed, sign-up signs in at once."""

    def __init__(self) -> None:
        self._users: dict[str, tuple[User, bytes, bytes]] = {}  # email -> (user, salt, scrypt hash)
        self._access: dict[str, tuple[User, float]] = {}  # token digest -> (user, expiry)
        self._refresh: dict[str, User] = {}  # token digest -> user (single use)
        self._lock = threading.Lock()

    @staticmethod
    def _hash(password: str, salt: bytes) -> bytes:
        return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)

    def _issue(self, user: User) -> Session:
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self._access = {**self._access, _digest(access): (user, time.monotonic() + ACCESS_TOKEN_SECONDS)}
        self._refresh = {**self._refresh, _digest(refresh): user}
        return Session(access, refresh, ACCESS_TOKEN_SECONDS, user)

    def sign_up(self, email: str, password: str) -> SignUpResult:
        salt = secrets.token_bytes(16)
        hashed = self._hash(password, salt)
        with self._lock:
            if email in self._users:
                raise AuthError("sign-up rejected")
            user = User(str(uuid.uuid4()), email)
            self._users = {**self._users, email: (user, salt, hashed)}
            return SignUpResult(self._issue(user))

    def sign_in(self, email: str, password: str) -> Session:
        entry = self._users.get(email)
        # Hash even for an unknown email, so timing does not reveal which emails have accounts.
        user, salt, expected = entry if entry else (None, b"\0" * 16, b"")
        if not hmac.compare_digest(self._hash(password, salt), expected) or user is None:
            raise AuthError("invalid credentials")
        with self._lock:
            return self._issue(user)

    def refresh(self, refresh_token: str) -> Session:
        with self._lock:
            refreshed = {**self._refresh}
            user = refreshed.pop(_digest(refresh_token), None)  # rotation: a refresh token works once
            if user is None:
                raise AuthError("invalid refresh token")
            self._refresh = refreshed
            return self._issue(user)

    def sign_out(self, access_token: str) -> None:
        user = self.get_user(access_token)
        with self._lock:
            self._access = {key: value for key, value in self._access.items() if value[0].id != user.id}
            self._refresh = {key: value for key, value in self._refresh.items() if value.id != user.id}

    def get_user(self, access_token: str) -> User:
        entry = self._access.get(_digest(access_token))
        if entry is None or entry[1] < time.monotonic():
            raise AuthError("invalid token")
        return entry[0]


class SupabaseAuth:
    """Supabase Auth (GoTrue) over HTTP. Error bodies are never passed on: they may name the email."""

    def __init__(self, url: str, publishable_key: str, client: httpx2.Client | None = None) -> None:
        self._base = f"{url.rstrip('/')}/auth/v1"
        self._client = client or httpx2.Client(timeout=10)
        self._key = publishable_key
        self._cache: dict[str, tuple[User, float]] = {}  # token digest -> (user, verified until)
        self._lock = threading.Lock()

    def _call(self, method: str, path: str, *, json: dict | None = None, params: dict | None = None,
              token: str | None = None) -> dict | None:
        headers = {"apikey": self._key, "Authorization": f"Bearer {token or self._key}"}
        try:
            response = self._client.request(method, f"{self._base}{path}", json=json, params=params, headers=headers)
        except httpx2.HTTPError as exc:
            raise AuthUnavailable(f"Supabase Auth request failed: {type(exc).__name__}") from None
        if response.status_code >= 500 or response.status_code == 429:
            raise AuthUnavailable(f"Supabase Auth answered {response.status_code}")
        if response.status_code >= 400:
            raise AuthError(f"Supabase Auth answered {response.status_code}")
        if response.status_code == 204 or not response.content:
            return None
        try:
            body = response.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            raise AuthUnavailable("Supabase Auth returned an unexpected body")
        return body

    @staticmethod
    def _user(body: dict) -> User:
        try:
            return User(str(uuid.UUID(body["id"])), str(body["email"]))
        except (KeyError, TypeError, ValueError):
            raise AuthUnavailable("Supabase Auth returned an unexpected user") from None

    def _session(self, body: dict | None) -> Session:
        try:
            return Session(str(body["access_token"]), str(body["refresh_token"]), int(body["expires_in"]),
                           self._user(body["user"]))
        except (KeyError, TypeError, ValueError):
            raise AuthUnavailable("Supabase Auth returned an unexpected session") from None

    def sign_up(self, email: str, password: str) -> SignUpResult:
        body = self._call("POST", "/signup", json={"email": email, "password": password})
        # With email confirmation on, Supabase answers with a user and no session (also for a taken email).
        return SignUpResult(self._session(body) if body and "access_token" in body else None)

    def sign_in(self, email: str, password: str) -> Session:
        return self._session(self._call("POST", "/token", params={"grant_type": "password"},
                                        json={"email": email, "password": password}))

    def refresh(self, refresh_token: str) -> Session:
        return self._session(self._call("POST", "/token", params={"grant_type": "refresh_token"},
                                        json={"refresh_token": refresh_token}))

    def sign_out(self, access_token: str) -> None:
        with self._lock:
            self._cache = {key: value for key, value in self._cache.items() if key != _digest(access_token)}
        self._call("POST", "/logout", token=access_token)

    def get_user(self, access_token: str) -> User:
        key = _digest(access_token)
        cached = self._cache.get(key)
        if cached and cached[1] > time.monotonic():
            return cached[0]
        user = self._user(self._call("GET", "/user", token=access_token) or {})
        with self._lock:
            live = {k: v for k, v in self._cache.items() if v[1] > time.monotonic()}
            if len(live) >= USER_CACHE_MAX:
                live = {}
            self._cache = {**live, key: (user, time.monotonic() + USER_CACHE_SECONDS)}
        return user


@lru_cache
def _local_auth() -> InMemoryAuth:
    return InMemoryAuth()


@lru_cache
def _supabase_auth(url: str, publishable_key: str) -> SupabaseAuth:
    return SupabaseAuth(url, publishable_key)


def get_auth() -> AuthProvider | None:
    """Supabase Auth when configured; in-memory accounts for local and E2E runs; otherwise None (accounts off)."""
    settings = get_settings()
    if settings.accounts_enabled:
        return _supabase_auth(settings.supabase_url.strip(), settings.supabase_publishable_key.strip())
    # In-memory users only next to the in-memory design store: their ids are not Supabase users.
    if settings.app_env in ("local", "e2e") and not settings.storage_enabled:
        return _local_auth()
    return None
