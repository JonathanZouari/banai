"""Accounts PROTOTYPE (branch feature/auth; accounts are excluded from the MVP scope in CLAUDE.md).

Email + password sign-up and sign-in through the backend. The browser sends the access token as
`Authorization: Bearer <token>` to /api/auth/* and /api/me/*. Failures never say whether an email
has an account. Attempts are rate limited per email and per client address."""

from __future__ import annotations

import json
import logging
import re
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.agent.language import LANGUAGES, Language
from app.api.agent import error
from app.api.export import read_capped
from app.auth.provider import AuthError, AuthProvider, AuthUnavailable, Session, User, get_auth
from app.services.rate_limit import RateLimiter

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 4_000
NO_STORE = {"Cache-Control": "no-store"}
EMAIL_PATTERN = r"^[^\s@\x00-\x1f\x7f]{1,64}@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$"
# ASSUMPTION: configurable defaults, not business rules.
MIN_PASSWORD = 8
MAX_PASSWORD = 72  # bcrypt (Supabase) ignores bytes past 72; checked in UTF-8 bytes below
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9._~+/=-]{8,4096}$")  # a JWT or an opaque (refresh) token

# ASSUMPTION: limits per worker. The client address is the direct peer: behind a proxy that may be the
# proxy itself, so the per-email limits do the real work against password guessing.
LOGIN_PER_EMAIL = RateLimiter(10, 15 * 60)
LOGIN_PER_CLIENT = RateLimiter(50, 15 * 60)
SIGNUP_PER_CLIENT = RateLimiter(10, 60 * 60)
REFRESH_PER_CLIENT = RateLimiter(120, 15 * 60)
LIMITERS = (LOGIN_PER_EMAIL, LOGIN_PER_CLIENT, SIGNUP_PER_CLIENT, REFRESH_PER_CLIENT)

MESSAGES = {
    "INVALID_REQUEST": {"he": "הבקשה אינה תקינה.", "en": "The request is not valid.", "es": "La solicitud no es válida."},
    "INVALID_EMAIL": {"he": "כתובת האימייל אינה תקינה.", "en": "Enter a valid email address.", "es": "Introduce un correo electrónico válido."},
    "WEAK_PASSWORD": {"he": f"הסיסמה צריכה להכיל {MIN_PASSWORD} עד {MAX_PASSWORD} תווים.",
                      "en": f"The password needs {MIN_PASSWORD} to {MAX_PASSWORD} characters.", "es": f"La contraseña debe tener entre {MIN_PASSWORD} y {MAX_PASSWORD} caracteres."},
    "INVALID_CREDENTIALS": {"he": "האימייל או הסיסמה שגויים.", "en": "The email or password is incorrect.", "es": "El correo o la contraseña no son correctos."},
    "SIGNUP_FAILED": {"he": "לא ניתן ליצור חשבון עם הפרטים האלה.",
                      "en": "An account could not be created with these details.", "es": "No se pudo crear una cuenta con estos datos."},
    "UNAUTHORIZED": {"he": "צריך להתחבר מחדש.", "en": "Please sign in again.", "es": "Vuelve a iniciar sesión."},
    "RATE_LIMITED": {"he": "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.",
                     "en": "Too many attempts. Please try again in a few minutes.", "es": "Demasiados intentos. Inténtalo de nuevo en unos minutos."},
    "ACCOUNTS_UNAVAILABLE": {"he": "חשבונות משתמש לא זמינים בשרת הזה.",
                             "en": "Accounts are not available on this server.", "es": "Las cuentas no están disponibles en este servidor."},
    "AUTH_ERROR": {"he": "ההתחברות נכשלה. נסה שוב בעוד רגע.", "en": "Signing in failed. Please try again in a moment.", "es": "No se pudo iniciar sesión. Inténtalo de nuevo en un momento."},
}


def fail(status: int, code: str, language: str) -> JSONResponse:
    return error(status, code, MESSAGES[code][language])


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: Annotated[str, Field(max_length=254)]
    password: str
    language: Language = "he"


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refreshToken: Annotated[str, Field(pattern=TOKEN_PATTERN.pattern)]
    language: Language = "he"


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    return token if scheme.lower() == "bearer" and TOKEN_PATTERN.fullmatch(token) else None


def _language_of(raw: object) -> str:
    return raw["language"] if isinstance(raw, dict) and raw.get("language") in LANGUAGES else "he"


async def _parse(request: Request, model: type[BaseModel]) -> tuple[BaseModel | None, str]:
    body = await read_capped(request, MAX_BODY_BYTES)
    try:
        raw = json.loads(body) if body is not None else None
    except (ValueError, RecursionError):
        raw = None
    language = _language_of(raw)
    try:
        return model.model_validate(raw), language
    except ValidationError:
        return None, language


def _check_credentials(credentials: Credentials) -> tuple[str, str | None]:
    """(normalized email, error code or None)."""
    email = credentials.email.strip().lower()
    if not re.fullmatch(EMAIL_PATTERN, email):
        return email, "INVALID_EMAIL"
    if not (MIN_PASSWORD <= len(credentials.password) and len(credentials.password.encode()) <= MAX_PASSWORD):
        return email, "WEAK_PASSWORD"
    return email, None


def _user_json(user: User) -> dict:
    return {"id": user.id, "email": user.email}


def _session_response(session: Session, status: int = 200) -> JSONResponse:
    data = {"user": _user_json(session.user), "accessToken": session.access_token,
            "refreshToken": session.refresh_token, "expiresIn": session.expires_in}
    return JSONResponse(status_code=status, content={"success": True, "data": data}, headers=NO_STORE)


async def current_user(request: Request, language: str) -> tuple[AuthProvider, User] | JSONResponse:
    """The signed-in user, or the error response to return."""
    auth = get_auth()
    if auth is None:
        return fail(503, "ACCOUNTS_UNAVAILABLE", language)
    token = bearer_token(request)
    if token is None:
        return fail(401, "UNAUTHORIZED", language)
    try:
        return auth, await run_in_threadpool(auth.get_user, token)
    except AuthError:
        return fail(401, "UNAUTHORIZED", language)
    except AuthUnavailable:
        logger.exception("Verifying a session failed")
        return fail(503, "AUTH_ERROR", language)


@router.post("/auth/signup", status_code=201)
async def sign_up(request: Request):
    auth = get_auth()
    parsed, language = await _parse(request, Credentials)
    if auth is None:
        return fail(503, "ACCOUNTS_UNAVAILABLE", language)
    if parsed is None:
        return fail(422, "INVALID_REQUEST", language)
    email, problem = _check_credentials(parsed)
    if problem:
        return fail(422, problem, language)
    if not SIGNUP_PER_CLIENT.allow(client_key(request)):
        return fail(429, "RATE_LIMITED", language)
    try:
        result = await run_in_threadpool(auth.sign_up, email, parsed.password)
    except AuthError:
        return fail(400, "SIGNUP_FAILED", language)
    except AuthUnavailable:
        logger.exception("Sign-up failed")
        return fail(503, "AUTH_ERROR", language)
    if result.session is None:
        data = {"confirmationRequired": True}
        return JSONResponse(status_code=201, content={"success": True, "data": data}, headers=NO_STORE)
    return _session_response(result.session, 201)


@router.post("/auth/login")
async def sign_in(request: Request):
    auth = get_auth()
    parsed, language = await _parse(request, Credentials)
    if auth is None:
        return fail(503, "ACCOUNTS_UNAVAILABLE", language)
    if parsed is None:
        return fail(422, "INVALID_REQUEST", language)
    email = parsed.email.strip().lower()
    if not LOGIN_PER_CLIENT.allow(client_key(request)) or not LOGIN_PER_EMAIL.allow(email):
        return fail(429, "RATE_LIMITED", language)
    try:
        session = await run_in_threadpool(auth.sign_in, email, parsed.password)
    except AuthError:
        return fail(401, "INVALID_CREDENTIALS", language)
    except AuthUnavailable:
        logger.exception("Sign-in failed")
        return fail(503, "AUTH_ERROR", language)
    return _session_response(session)


@router.post("/auth/refresh")
async def refresh(request: Request):
    auth = get_auth()
    parsed, language = await _parse(request, RefreshRequest)
    if auth is None:
        return fail(503, "ACCOUNTS_UNAVAILABLE", language)
    if parsed is None:
        return fail(401, "UNAUTHORIZED", language)
    if not REFRESH_PER_CLIENT.allow(client_key(request)):
        return fail(429, "RATE_LIMITED", language)
    try:
        session = await run_in_threadpool(auth.refresh, parsed.refreshToken)
    except AuthError:
        return fail(401, "UNAUTHORIZED", language)
    except AuthUnavailable:
        logger.exception("Refreshing a session failed")
        return fail(503, "AUTH_ERROR", language)
    return _session_response(session)


@router.post("/auth/logout")
async def sign_out(request: Request, language: Language = "he"):
    signed_in = await current_user(request, language)
    if isinstance(signed_in, JSONResponse):
        return signed_in
    auth, _ = signed_in
    try:
        await run_in_threadpool(auth.sign_out, bearer_token(request))
    except AuthError:
        pass  # already signed out
    except AuthUnavailable:
        logger.exception("Sign-out failed")
        return fail(503, "AUTH_ERROR", language)
    return JSONResponse(content={"success": True, "data": {}}, headers=NO_STORE)


@router.get("/auth/me")
async def me(request: Request, language: Language = "he"):
    signed_in = await current_user(request, language)
    if isinstance(signed_in, JSONResponse):
        return signed_in
    return JSONResponse(content={"success": True, "data": {"user": _user_json(signed_in[1])}}, headers=NO_STORE)
