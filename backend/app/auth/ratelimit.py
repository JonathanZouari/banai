"""A small in-process sliding-window limiter for the account endpoints (per worker; enough for the MVP).
It slows password guessing and sign-up floods before they reach Supabase."""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Callable

from fastapi import Request

WINDOW_SECONDS = 15 * 60
MAX_KEYS = 10_000  # bounds memory under a flood of distinct keys


class RateLimiter:
    """`limit` is read on every call (settings can differ per environment, e.g. E2E)."""

    def __init__(self, limit: Callable[[], int], window: float = WINDOW_SECONDS, clock=time.monotonic) -> None:
        self._limit, self._window, self._clock = limit, window, clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Records an attempt for `key`; False when it is over the limit for the window."""
        now = self._clock()
        with self._lock:
            if len(self._hits) >= MAX_KEYS and key not in self._hits:
                self._prune(now)
                if len(self._hits) >= MAX_KEYS:
                    return False
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self._window:
                hits.popleft()
            if len(hits) >= self._limit():
                return False
            hits.append(now)
            return True

    def _prune(self, now: float) -> None:
        self._hits = {key: hits for key, hits in self._hits.items() if hits and hits[-1] > now - self._window}


def client_ip(request: Request) -> str:
    """The caller's IP. Behind Railway's proxy that is the last X-Forwarded-For hop: the one the proxy
    added. Earlier hops come from the client and could be forged."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    if hops:
        return hops[-1][:64]
    return request.client.host if request.client else "unknown"
