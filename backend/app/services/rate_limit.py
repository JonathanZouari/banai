"""A small in-process sliding-window rate limiter. Per worker, not shared: a brake on password guessing
and sign-up floods, not a quota system. Supabase Auth applies its own limits on top."""

from __future__ import annotations

import threading
import time
from collections import deque


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float, max_keys: int = 10_000) -> None:
        self._limit = limit
        self._window = window_seconds
        self._max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Count one attempt for `key`; False once it has used up the window."""
        now = time.monotonic()
        with self._lock:
            if len(self._hits) >= self._max_keys:
                self._hits = {k: q for k, q in self._hits.items() if q and q[-1] > now - self._window}
                if len(self._hits) >= self._max_keys:
                    return False  # flooded with distinct keys: refuse rather than grow without bound
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self._window:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits = {}
