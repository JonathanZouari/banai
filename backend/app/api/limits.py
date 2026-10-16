"""Abuse limits: per-client rate limiting and a request body size cap."""

from __future__ import annotations

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.envelope import fail

# Client address as seen by the app. Behind a trusted proxy configure uvicorn `--proxy-headers`
# with `--forwarded-allow-ips` rather than trusting X-Forwarded-For here.
limiter = Limiter(key_func=get_remote_address)


def rate_limit_handler(_request: Request, _error: RateLimitExceeded):
    return fail(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.")


class BodyLimitMiddleware:
    """Refuse request bodies above `max_bytes` (by Content-Length, and by counting streamed bytes)."""

    def __init__(self, app: ASGIApp, max_bytes: int, path_limits: dict[str, int] | None = None) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.path_limits = path_limits or {}  # exact path -> its own cap (audio uploads)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.path_limits.get(scope["path"], self.max_bytes)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await self._too_large(scope, receive, send)
            return

        seen = 0

        async def limited_receive() -> Message:
            # A streamed body past the cap is cut off: the app then sees invalid JSON and answers 422.
            nonlocal seen
            if seen > limit:
                return {"type": "http.request", "body": b"", "more_body": False}
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        await self.app(scope, limited_receive, send)

    async def _too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = fail(413, "PAYLOAD_TOO_LARGE", "The request is too large.")
        await response(scope, receive, send)
