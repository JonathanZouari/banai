"""Caps request bodies before anything reads them. The API is unauthenticated and FastAPI buffers a
JSON body of any size in memory before Pydantic checks it, so a few huge uploads could otherwise
exhaust the server's memory.

1 MiB is well above the largest valid request: /api/chat takes at most 40 messages of 2000
characters, which stays under 1 MB even if every character arrives \\u-escaped as a surrogate pair.
The one exception is POST /api/dossier, which carries a render PNG of up to 2 MiB as base64 (about
2.8 MB) next to the design: it gets 4 MiB, and every other route keeps 1 MiB.
"""

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

MAX_BODY_BYTES = 1024 * 1024
DOSSIER_MAX_BODY_BYTES = 4 * 1024 * 1024
ROUTE_LIMITS = {("POST", "/api/dossier"): DOSSIER_MAX_BODY_BYTES}  # (method, path) -> cap


def _too_large() -> JSONResponse:
    return JSONResponse(
        status_code=413,
        content={"success": False, "data": None, "error": {"code": "PAYLOAD_TOO_LARGE", "message": "The request is too large."}},
    )


class BodySizeLimitMiddleware:
    """Refuses a declared Content-Length over the cap at once. Otherwise reads the body (chunked
    uploads included) up to the cap before the app runs, then hands it on unchanged."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES, route_limits: dict | None = None):
        self.app = app
        self.max_bytes = max_bytes
        self.route_limits = ROUTE_LIMITS if route_limits is None else route_limits

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.route_limits.get((scope.get("method"), scope.get("path")), self.max_bytes)
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > limit:
            await _too_large()(scope, receive, send)
            return

        chunks, size, more = [], 0, True
        while more:
            message = await receive()
            if message["type"] != "http.request":  # the client went away
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                await _too_large()(scope, receive, send)
                return
            chunks.append(chunk)
            more = message.get("more_body", False)

        replayed = False

        async def replay():
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, replay, send)
