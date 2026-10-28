"""Customer accounts: sign up, log in, refresh and log out with email + password (approved exception,
2026-10-23). Only the backend talks to Supabase Auth. The browser gets the session tokens and sends the
access token as `Authorization: Bearer <token>`; a logged-in customer is what saving a design requires."""

from __future__ import annotations

import json
import logging
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.api.agent import error
from app.api.export import read_capped
from app.auth.provider import AuthError, AuthUnavailable, Session, User, get_auth_provider
from app.auth.ratelimit import RateLimiter, client_ip
from app.config import get_settings

router = APIRouter(prefix="/api/auth")
logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 4_000
NO_STORE = {"Cache-Control": "no-store"}
EMAIL_PATTERN = r"^[^@\s\x00-\x1f\x7f]{1,64}@[^@\s\x00-\x1f\x7f]{1,189}\.[A-Za-z]{2,63}$"
# Printable text only. 72 bytes is bcrypt's limit, which Supabase Auth uses.
PASSWORD_PATTERN = r"^[^\x00-\x1f\x7f]{8,72}$"
ACCESS_TOKEN = re.compile(r"^[A-Za-z0-9._-]{20,4096}$")
REFRESH_TOKEN_PATTERN = r"^[A-Za-z0-9._-]{8,512}$"

ip_limiter = RateLimiter(lambda: get_settings().auth_max_per_ip)
email_limiter = RateLimiter(lambda: get_settings().auth_max_per_email)

MESSAGES = {
    "INVALID_REQUEST": {"he": "הבקשה אינה תקינה.", "en": "The request is not valid."},
    "INVALID_EMAIL": {"he": "כתובת האימייל אינה תקינה.", "en": "Enter a valid email address."},
    "WEAK_PASSWORD": {"he": "הסיסמה צריכה להכיל 8 עד 72 תווים.", "en": "The password must be 8 to 72 characters."},
    "INVALID_CREDENTIALS": {"he": "האימייל או הסיסמה שגויים.", "en": "The email or password is incorrect."},
    "EMAIL_TAKEN": {"he": "כבר קיים חשבון עם האימייל הזה. נסה להתחבר.",
                    "en": "An account with this email already exists. Try logging in."},
    "EMAIL_NOT_CONFIRMED": {"he": "צריך לאשר את האימייל לפני ההתחברות. בדוק את תיבת הדואר.",
                            "en": "Confirm your email before logging in. Check your inbox."},
    "SESSION_EXPIRED": {"he": "ההתחברות פגה. התחבר שוב.", "en": "Your session has expired. Please log in again."},
    "RATE_LIMITED": {"he": "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.",
                     "en": "Too many attempts. Please try again in a few minutes."},
    "AUTH_UNAVAILABLE": {"he": "התחברות עדיין לא זמינה בשרת הזה.", "en": "Accounts are not available on this server."},
    "AUTH_ERROR": {"he": "ההתחברות נכשלה. נסה שוב בעוד רגע.", "en": "Logging in failed. Please try again in a moment."},
}
STATUS = {
    "INVALID_REQUEST": 422, "INVALID_EMAIL": 422, "WEAK_PASSWORD": 422, "INVALID_CREDENTIALS": 401,
    "EMAIL_TAKEN": 409, "EMAIL_NOT_CONFIRMED": 403, "SESSION_EXPIRED": 401, "RATE_LIMITED": 429,
    "AUTH_UNAVAILABLE": 503, "AUTH_ERROR": 503,
}


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Annotated[str, Field(max_length=254, pattern=EMAIL_PATTERN)]
    password: Annotated[str, Field(pattern=PASSWORD_PATTERN)]
    language: Literal["he", "en"] = "he"


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refreshToken: Annotated[str, Field(pattern=REFRESH_TOKEN_PATTERN)]
    language: Literal["he", "en"] = "he"


def fail(code: str, language: str) -> JSONResponse:
    response = error(STATUS[code], code, MESSAGES[code][language])
    response.headers.update(NO_STORE)
    return response


def bearer_token(request: Request) -> str | None:
    """The access token from `Authorization: Bearer <token>`, when it is well formed."""
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    return token if scheme.lower() == "bearer" and ACCESS_TOKEN.fullmatch(token) else None


async def current_user(request: Request) -> User | None:
    """The logged-in customer, or None. Raises AuthUnavailable when the provider cannot answer."""
    provider, token = get_auth_provider(), bearer_token(request)
    if provider is None or token is None:
        return None
    return await run_in_threadpool(provider.get_user, token)


def _user_data(user: User) -> dict:
    return {"id": user.id, "email": user.email}


def _session_data(session: Session) -> dict:
    return {"user": _user_data(session.user), "accessToken": session.access_token,
            "refreshToken": session.refresh_token, "expiresIn": session.expires_in}


def _ok(data: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": True, "data": data}, headers=NO_STORE)


async def _parse(request: Request, model: type[BaseModel]):
    """(parsed, language), or (error response, language)."""
    body = await read_capped(request, MAX_BODY_BYTES)
    if body is None:
        return fail("INVALID_REQUEST", "he"), "he"
    try:
        raw = json.loads(body)
    except (ValueError, RecursionError):
        raw = None
    language = raw["language"] if isinstance(raw, dict) and raw.get("language") in ("he", "en") else "he"
    try:
        return model.model_validate(raw), language
    except ValidationError as exc:
        fields = {str(item["loc"][0]) for item in exc.errors() if item["loc"]}
        code = "INVALID_EMAIL" if "email" in fields else "WEAK_PASSWORD" if "password" in fields else "INVALID_REQUEST"
        return fail(code, language), language


async def _call(language: str, call, *args):
    """Run a provider call; refusals and outages become error responses (never with provider details)."""
    try:
        return await run_in_threadpool(call, *args)
    except AuthError as exc:
        return fail(exc.code if exc.code in STATUS else "AUTH_ERROR", language)
    except AuthUnavailable:
        logger.exception("Supabase Auth call failed")
        return fail("AUTH_ERROR", language)


async def _credentials(request: Request):
    """(credentials, ip), or an error response. Applies the per-IP and per-email limits."""
    provider = get_auth_provider()
    if provider is None:
        return fail("AUTH_UNAVAILABLE", "he")
    ip = client_ip(request)
    if not ip_limiter.allow(ip):
        return fail("RATE_LIMITED", "he")
    parsed, language = await _parse(request, Credentials)
    if isinstance(parsed, JSONResponse):
        return parsed
    email = parsed.email.strip().lower()
    if not email_limiter.allow(email):
        return fail("RATE_LIMITED", language)
    return parsed.model_copy(update={"email": email}), ip


@router.post("/signup", status_code=201)
async def sign_up(request: Request):
    checked = await _credentials(request)
    if isinstance(checked, JSONResponse):
        return checked
    credentials, ip = checked
    result = await _call(credentials.language, get_auth_provider().sign_up, credentials.email, credentials.password, ip)
    if isinstance(result, JSONResponse):
        return result
    user, _ = result
    # Accounts are created confirmed (no confirmation email); the customer logs in next.
    return _ok({"user": _user_data(user), "confirmationRequired": False}, 201)


@router.post("/login")
async def log_in(request: Request):
    checked = await _credentials(request)
    if isinstance(checked, JSONResponse):
        return checked
    credentials, ip = checked
    session = await _call(credentials.language, get_auth_provider().sign_in, credentials.email, credentials.password, ip)
    return session if isinstance(session, JSONResponse) else _ok(_session_data(session))


@router.post("/refresh")
async def refresh(request: Request):
    provider = get_auth_provider()
    if provider is None:
        return fail("AUTH_UNAVAILABLE", "he")
    ip = client_ip(request)
    if not ip_limiter.allow(f"refresh:{ip}"):
        return fail("RATE_LIMITED", "he")
    parsed, language = await _parse(request, RefreshRequest)
    if isinstance(parsed, JSONResponse):
        return fail("SESSION_EXPIRED", language) if parsed.status_code == 422 else parsed
    session = await _call(language, provider.refresh, parsed.refreshToken, ip)
    return session if isinstance(session, JSONResponse) else _ok(_session_data(session))


@router.post("/logout")
async def log_out(request: Request):
    provider, token = get_auth_provider(), bearer_token(request)
    if provider is not None and token is not None:
        result = await _call("he", provider.sign_out, token)
        if isinstance(result, JSONResponse):
            return result
    return _ok({"loggedOut": True})  # no session to end is still a logout
