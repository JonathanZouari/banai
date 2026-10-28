"""Spend and abuse guards shared by the routes: the rate limiter, process-wide hourly caps and the
request body cap.

Behind a proxy (Railway) every request arrives from the proxy's address, so the limiter would see one
client. FORWARDED_HOPS (default 0 = off) names how many trusted proxies append to X-Forwarded-For;
the client is the entry that many places from the right, which a client cannot spoof (anything it
sends itself stays further left). The hourly caps are per worker, in memory.
"""

from __future__ import annotations

import json
import time
from collections import deque
from collections.abc import Callable
from threading import Lock

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings


def client_ip(request: Request) -> str:
    hops = get_settings().forwarded_hops
    if hops > 0:
        # Every X-Forwarded-For line, in order: a proxy may add its own line instead of appending to the
        # client's, and reading only the first line would then trust the client's value.
        joined = ",".join(request.headers.getlist("x-forwarded-for"))
        chain = [part.strip() for part in joined.split(",") if part.strip()]
        if len(chain) >= hops:
            return chain[-hops]
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)


class HourlyCap:
    """Process-wide ceiling: `over(cap)` is True once `cap` requests already ran this hour."""

    def __init__(self) -> None:
        self._recent: deque[float] = deque()
        self._lock = Lock()

    def over(self, cap: int) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._recent and now - self._recent[0] > 3600:
                self._recent.popleft()
            if len(self._recent) >= cap:
                return True
            self._recent.append(now)
            return False

    def reset(self) -> None:
        with self._lock:
            self._recent.clear()


class DailyBudget:
    """Process-wide rolling 24-hour allowance of some amount (e.g. bytes): `spend(n, budget)` is False
    (and records nothing) when `n` more would go over `budget`."""

    def __init__(self) -> None:
        self._spent: deque[tuple[float, int]] = deque()
        self._lock = Lock()

    def spend(self, amount: int, budget: int) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._spent and now - self._spent[0][0] > 86400:
                self._spent.popleft()
            if sum(spent for _, spent in self._spent) + amount > budget:
                return False
            self._spent.append((now, amount))
            return True

    def reset(self) -> None:
        with self._lock:
            self._spent.clear()


class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """413 for any request body over the route's limit, counted as the bytes arrive.

    The Content-Length header is checked first (cheap), but chunked bodies have none, so every body
    chunk is also counted; reading stops at the first byte over the limit.
    """

    def __init__(self, app: ASGIApp, limit_for: Callable[[str], int]) -> None:
        self.app = app
        self.limit_for = limit_for

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.limit_for(scope["path"])
        length = dict(scope["headers"]).get(b"content-length", b"")
        if length.isdigit() and int(length) > limit:
            await self._reject(send)
            return
        received = 0
        too_large = False
        started = False

        async def limited_receive() -> Message:
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    too_large = True
                    raise _TooLarge()
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal started
            # FastAPI turns a failed body read into its own 400: drop that answer, the 413 replaces it.
            if too_large and not started:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except _TooLarge:
            pass
        if too_large and not started:
            await self._reject(send)

    @staticmethod
    async def _reject(send: Send) -> None:
        body = json.dumps({"success": False, "data": None, "error": {"code": "BODY_TOO_LARGE", "message": "The request is too large."}}).encode()
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
