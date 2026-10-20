"""Where saved projects live (ADR-042). A project is a design plus, optionally, the customer's details, kept in
Supabase and reached by a link that carries a secret token: no accounts. Only this backend talks to the table
(`designs`, RLS on with no policies); the service key never leaves the server.

`ProjectRepo` is the small interface the API uses. `SupabaseRepo` speaks PostgREST; `MemoryRepo` keeps rows in
this process (tests and the E2E server). Nothing here logs a design, a customer or a token.
"""

from __future__ import annotations

import copy
import threading
import uuid
from datetime import UTC, datetime
from typing import Any, Protocol

import httpx2

from app.config import Settings, get_settings

TIMEOUT_SECONDS = 8.0
MAX_STORED_DESIGNS = 5000  # a ceiling for an unauthenticated create endpoint (a LOW in the security review)


class StorageError(RuntimeError):
    """The store could not be reached, or answered with something unexpected."""


class StorageOff(RuntimeError):
    """No store is configured on this server."""


class ProjectRepo(Protocol):
    def count(self) -> int: ...

    def create(self, *, token_hash: str, name: str, design: dict, customer: dict | None) -> dict[str, Any]:
        """Store a project at revision 1. Returns its row: id, name, revision."""

    def get(self, project_id: str) -> dict[str, Any] | None:
        """The row (id, token_hash, name, design, customer, revision), or None."""

    def update(self, project_id: str, revision: int, *, name: str, design: dict, customer: dict | None) -> int | None:
        """Save over `revision`. Returns the new revision, or None when the stored revision is no longer that one."""

    def delete(self, project_id: str) -> bool: ...


class MemoryRepo:
    """Rows in this process: tests, and the E2E server (STORAGE=memory)."""

    def __init__(self) -> None:
        self._rows: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def count(self) -> int:
        with self._lock:
            return len(self._rows)

    def create(self, *, token_hash: str, name: str, design: dict, customer: dict | None) -> dict[str, Any]:
        row = {"id": str(uuid.uuid4()), "token_hash": token_hash, "name": name, "design": copy.deepcopy(design),
               "customer": copy.deepcopy(customer), "revision": 1}
        with self._lock:
            self._rows[row["id"]] = row
        return {"id": row["id"], "name": name, "revision": 1}

    def get(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._rows.get(project_id)
            return copy.deepcopy(row) if row else None

    def update(self, project_id: str, revision: int, *, name: str, design: dict, customer: dict | None) -> int | None:
        with self._lock:
            row = self._rows.get(project_id)
            if row is None or row["revision"] != revision:
                return None
            row.update(name=name, design=copy.deepcopy(design), customer=copy.deepcopy(customer), revision=revision + 1)
            return row["revision"]

    def delete(self, project_id: str) -> bool:
        with self._lock:
            return self._rows.pop(project_id, None) is not None


class SupabaseRepo:
    """The `designs` table through Supabase's REST interface (PostgREST), with the service key."""

    def __init__(self, url: str, secret_key: str, client: httpx2.Client | None = None) -> None:
        self._client = client or httpx2.Client(
            base_url=f"{url.rstrip('/')}/rest/v1",
            headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"},
            timeout=TIMEOUT_SECONDS,
        )

    def _call(self, method: str, path: str, **kwargs: Any) -> httpx2.Response:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx2.HTTPError as error:
            raise StorageError(type(error).__name__) from None  # the class only: a URL or a body never reaches a log
        if response.status_code >= 400:
            raise StorageError(f"status {response.status_code}")
        return response

    @staticmethod
    def _rows(response: httpx2.Response) -> list[dict[str, Any]]:
        try:
            rows = response.json()
        except ValueError:
            raise StorageError("not json") from None
        if not isinstance(rows, list):
            raise StorageError("unexpected shape")
        return rows

    def count(self) -> int:
        response = self._call("GET", "/designs", params={"select": "id", "limit": "1"}, headers={"Prefer": "count=exact"})
        total = response.headers.get("content-range", "").rpartition("/")[2]
        if not total.isdigit():
            raise StorageError("no count")
        return int(total)

    def create(self, *, token_hash: str, name: str, design: dict, customer: dict | None) -> dict[str, Any]:
        response = self._call(
            "POST", "/designs", headers={"Prefer": "return=representation"},
            json={"token_hash": token_hash, "name": name, "design": design, "customer": customer},
        )
        rows = self._rows(response)
        if len(rows) != 1 or "id" not in rows[0]:
            raise StorageError("no row")
        return {"id": rows[0]["id"], "name": name, "revision": rows[0].get("revision", 1)}

    def get(self, project_id: str) -> dict[str, Any] | None:
        response = self._call(
            "GET", "/designs",
            params={"id": f"eq.{project_id}", "select": "id,token_hash,name,design,customer,revision", "limit": "1"},
        )
        rows = self._rows(response)
        return rows[0] if rows else None

    def update(self, project_id: str, revision: int, *, name: str, design: dict, customer: dict | None) -> int | None:
        response = self._call(
            "PATCH", "/designs",
            params={"id": f"eq.{project_id}", "revision": f"eq.{revision}"},
            headers={"Prefer": "return=representation"},
            json={"name": name, "design": design, "customer": customer, "revision": revision + 1,
                  "updated_at": datetime.now(UTC).isoformat()},
        )
        rows = self._rows(response)  # empty: someone saved first (or it is gone)
        if not rows:
            return None
        revision = rows[0].get("revision")
        if not isinstance(revision, int):
            raise StorageError("no revision")
        return revision

    def delete(self, project_id: str) -> bool:
        response = self._call("DELETE", "/designs", params={"id": f"eq.{project_id}"}, headers={"Prefer": "return=representation"})
        return bool(self._rows(response))


_memory = MemoryRepo()
_supabase: SupabaseRepo | None = None
_supabase_for: tuple[str, str] | None = None


def _safe_url(url: str) -> bool:
    """The service key must never travel in clear text: https, except to this machine."""
    return url.startswith("https://") or url.startswith(("http://localhost", "http://127.0.0.1"))


def storage_mode(settings: Settings | None = None) -> str:
    """'supabase', 'memory' or 'off'. Automatic: Supabase when its URL and key are set, otherwise off.
    STORAGE=memory is for tests and the E2E server; STORAGE=off switches the store off."""
    settings = settings or get_settings()
    if settings.storage == "memory":
        return "off" if settings.app_env == "production" else "memory"  # rows in a process would be lost
    if settings.storage == "off":
        return "off"
    if not (settings.supabase_url and settings.supabase_secret_key):
        return "off"
    return "supabase" if _safe_url(settings.supabase_url) else "off"


def get_repo() -> ProjectRepo:
    """The configured store. Raises StorageOff when there is none."""
    global _supabase, _supabase_for
    settings = get_settings()
    mode = storage_mode(settings)
    if mode == "memory":
        return _memory
    if mode == "off":
        raise StorageOff
    wanted = (settings.supabase_url, settings.supabase_secret_key)
    if _supabase is None or _supabase_for != wanted:
        _supabase, _supabase_for = SupabaseRepo(*wanted), wanted
    return _supabase
