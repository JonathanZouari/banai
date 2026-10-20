"""/api/projects (ADR-042): projects kept on the server and shared by a link, with no accounts.

    POST   /api/projects        {name, design, customer?}  -> 201 {id, token, revision}   (the token is shown once)
    GET    /api/projects/{id}   Authorization: Bearer <token>        -> {id, name, design, customer, revision}
    PUT    /api/projects/{id}   Authorization + If-Match: <revision> -> {revision}       (409 STALE if it moved on)
    DELETE /api/projects/{id}   Authorization                        -> {deleted: true}

The token is 256 random bits; only its SHA-256 is stored and it is compared in constant time. An unknown id and a
wrong token are the same 404, so the answer says nothing about which ids exist. The design goes through the same
engine checks as everywhere else and the customer's details through the same model as the dossier's. Request
bodies keep the 1 MiB cap. Nothing from a request (design, customer, token) is echoed back or logged.
"""

import hashlib
import hmac
import json
import logging
import re
import secrets
import threading
import time
import uuid
from collections import deque

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.limits import too_many_nodes
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.schema import SAFE_TEXT_PATTERN, parse_design
from app.domain.validation import validate_canonical
from app.config import get_settings
from app.dossier.customer import Customer
from app.store import MAX_STORED_DESIGNS, ProjectRepo, StorageError, StorageOff, get_repo

router = APIRouter(prefix="/api")
log = logging.getLogger(__name__)

TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")  # secrets.token_urlsafe(32)
MAX_NAME = 60
CREATES_PER_HOUR = 300  # per server process: a flood of new projects is refused instead of filling the table
REQUESTS_PER_MINUTE_PER_IP = 90  # every /api/projects route, per client address
CREATES_PER_HOUR_PER_IP = 20
MAX_DESIGN_JSON_BYTES = 300_000  # a design is a few KB; this keeps a row small whatever the body cap lets through
_creates: deque[float] = deque()
_ip_hits: dict[str, deque[float]] = {}
_ip_creates: dict[str, deque[float]] = {}
_creates_lock = threading.Lock()
_slots = threading.BoundedSemaphore(8)  # requests to the store at once; a request never waits for one


class ProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_NAME, pattern=SAFE_TEXT_PATTERN)
    design: dict
    customer: Customer | None = None


def _error(status: int, code: str, message: str, path: str | None = None) -> JSONResponse:
    error = {"code": code, "message": message} if path is None else {"code": code, "message": message, "path": path}
    return JSONResponse(status_code=status, content={"success": False, "data": None, "error": error})


def _ok(data: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": True, "data": data, "error": None},
                        headers={"Cache-Control": "no-store"})


def _not_found() -> JSONResponse:
    return _error(404, "NOT_FOUND", "There is no such project, or the link is wrong.")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _bearer(authorization: str | None) -> str | None:
    scheme, _, value = (authorization or "").partition(" ")
    return value if scheme.lower() == "bearer" and TOKEN_PATTERN.fullmatch(value) else None


def _uuid(value: str) -> str | None:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def _client_ip(request: Request) -> str:
    """The address to count against. Behind one trusted proxy (TRUST_PROXY=true, as on Railway) it is the last
    X-Forwarded-For entry, which the proxy itself appended; otherwise the socket's peer."""
    if get_settings().trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        if forwarded:
            return forwarded[:64]
    return request.client.host if request.client else "unknown"


def _within(bucket: dict[str, deque[float]], key: str, limit: int, window: float, now: float) -> bool:
    """Counts a hit for `key` unless it already has `limit` in the last `window` seconds."""
    if len(bucket) > 10_000:  # bounded memory: drop the addresses that went quiet
        for stale in [k for k, hits in bucket.items() if not hits or now - hits[-1] > window]:
            del bucket[stale]
    hits = bucket.setdefault(key, deque())
    while hits and now - hits[0] > window:
        hits.popleft()
    if len(hits) >= limit:
        return False
    hits.append(now)
    return True


def _throttled(request: Request, create: bool = False, now: float | None = None) -> JSONResponse | None:
    """429 when this address has asked too often (every route) or made too many new projects (create)."""
    now = time.monotonic() if now is None else now
    ip = _client_ip(request)
    with _creates_lock:
        if not _within(_ip_hits, ip, REQUESTS_PER_MINUTE_PER_IP, 60.0, now):
            return _error(429, "RATE_LIMITED", "Too many requests. Try again in a minute.")
        if create and not _within(_ip_creates, ip, CREATES_PER_HOUR_PER_IP, 3600.0, now):
            return _error(429, "RATE_LIMITED", "Too many new projects. Try again later.")
    return None


def _creating_allowed(now: float | None = None) -> bool:
    now = time.monotonic() if now is None else now
    with _creates_lock:
        while _creates and now - _creates[0] > 3600:
            _creates.popleft()
        if len(_creates) >= CREATES_PER_HOUR:
            return False
        _creates.append(now)
        return True


def _checked(body: ProjectBody) -> tuple[dict, dict | None] | JSONResponse:
    """The design as the engine reads it, and the customer's details as a plain dict (None when empty)."""
    if too_many_nodes(body.design):
        return _error(422, "SCHEMA_INVALID", "the design is too large", "design")
    if len(json.dumps(body.design, ensure_ascii=False)) > MAX_DESIGN_JSON_BYTES:
        return _error(422, "SCHEMA_INVALID", "the design is too large", "design")
    try:
        design = parse_design(body.design)
    except DomainError as error:
        return _error(422, error.code, error.message, error.path)
    issues = validate_canonical(design, load_catalog())
    if issues:
        return _error(422, issues[0].code, issues[0].message, issues[0].path)
    # Stored as the browser writes it (camelCase, only the fields that are set), so it reads back unchanged.
    customer = body.customer.model_dump(mode="json", by_alias=True, exclude_none=True) if body.customer and not body.customer.is_empty() else None
    return design, customer


def _guarded(run):
    """Runs a store call inside a slot, and turns a missing or broken store into the envelope."""
    if not _slots.acquire(blocking=False):
        return _error(429, "BUSY", "The server is busy. Try again in a moment.")
    try:
        return run(get_repo())
    except StorageOff:
        return _error(503, "STORAGE_OFF", "Saving to the server is not set up here.")
    except StorageError as error:
        log.warning("project store failed: %s", error)  # the reason only: never a design, a customer or a token
        return _error(503, "STORAGE_UNAVAILABLE", "The project store did not answer. Try again in a moment.")
    finally:
        _slots.release()


@router.post("/projects")
def create_project(body: ProjectBody, request: Request):
    limited = _throttled(request, create=True)
    if limited:
        return limited
    checked = _checked(body)
    if isinstance(checked, JSONResponse):
        return checked
    design, customer = checked
    if not _creating_allowed():
        return _error(429, "RATE_LIMITED", "Too many new projects. Try again later.")
    token = secrets.token_urlsafe(32)

    def run(repo: ProjectRepo):
        if repo.count() >= MAX_STORED_DESIGNS:
            return _error(503, "STORAGE_FULL", "The server cannot keep more projects right now.")
        row = repo.create(token_hash=_hash(token), name=body.name.strip() or "ארון", design=design, customer=customer)
        return _ok({"id": row["id"], "token": token, "revision": row["revision"]}, 201)

    return _guarded(run)


def _owned(repo: ProjectRepo, project_id: str, authorization: str | None) -> dict | None:
    """The row, when the token is the right one; otherwise None (the same answer as for an unknown id)."""
    token = _bearer(authorization)
    row = repo.get(project_id)
    if row is None or token is None:
        # Compare against something either way, so a missing row takes as long as a wrong token.
        hmac.compare_digest(_hash(token or "x"), "0" * 64)
        return None
    return row if hmac.compare_digest(_hash(token), str(row.get("token_hash", ""))) else None


@router.get("/projects/{project_id}")
def get_project(project_id: str, request: Request, authorization: str | None = Header(default=None)):
    limited = _throttled(request)
    if limited:
        return limited
    pid = _uuid(project_id)
    if pid is None:
        return _not_found()

    def run(repo: ProjectRepo):
        row = _owned(repo, pid, authorization)
        if row is None:
            return _not_found()
        return _ok({"id": row["id"], "name": row["name"], "design": row["design"], "customer": row.get("customer"),
                    "revision": row["revision"]})

    return _guarded(run)


@router.put("/projects/{project_id}")
def update_project(project_id: str, body: ProjectBody, request: Request, authorization: str | None = Header(default=None),
                   if_match: str | None = Header(default=None)):
    limited = _throttled(request)
    if limited:
        return limited
    pid = _uuid(project_id)
    if pid is None:
        return _not_found()
    if if_match is None or not re.fullmatch(r"[0-9]{1,9}", if_match.strip().strip('"')):
        return _error(428, "REVISION_REQUIRED", "Send the revision you started from in If-Match.")
    revision = int(if_match.strip().strip('"'))

    def run(repo: ProjectRepo):
        # The token first: a caller without it never makes the server parse and validate a design.
        if _owned(repo, pid, authorization) is None:
            return _not_found()
        checked = _checked(body)
        if isinstance(checked, JSONResponse):
            return checked
        design, customer = checked
        saved = repo.update(pid, revision, name=body.name.strip() or "ארון", design=design, customer=customer)
        if saved is None:
            return _error(409, "STALE", "The project was saved from somewhere else since you opened it.")
        return _ok({"revision": saved})

    return _guarded(run)


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, request: Request, authorization: str | None = Header(default=None)):
    limited = _throttled(request)
    if limited:
        return limited
    pid = _uuid(project_id)
    if pid is None:
        return _not_found()

    def run(repo: ProjectRepo):
        if _owned(repo, pid, authorization) is None:
            return _not_found()
        repo.delete(pid)
        return _ok({"deleted": True})

    return _guarded(run)
