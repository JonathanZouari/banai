from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import agent, designs, export, health, reference, voice
from app.api.limits import BodyLimitMiddleware, limiter
from app.config import get_settings


MAX_BODY_BYTES = 300_000
# Routes that enforce their own (larger) cap while streaming the body: the header check here only
# stops bodies far past it, so the route can answer with its own error.
ROUTE_BODY_LIMITS = {"/api/export/pdf": export.MAX_BODY_BYTES + 4096}


def create_app() -> FastAPI:
    settings = get_settings()
    is_production = settings.app_env == "production"
    app = FastAPI(
        title="BanAI Wardrobe Designer API",
        version="0.1.0",
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
        openapi_url=None if is_production else "/openapi.json",
    )
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    def envelope(status: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(status_code=status, content={"success": False, "data": None, "error": {"code": code, "message": message}})

    @app.exception_handler(HTTPException)
    async def _http_error(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "message": str(exc.detail)}
        return envelope(exc.status_code, detail["code"], detail["message"])

    @app.exception_handler(RequestValidationError)
    async def _invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
        return envelope(422, "INVALID_REQUEST", "The request is invalid.")  # never echo input

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(_: Request, __: RateLimitExceeded) -> JSONResponse:
        return envelope(429, "RATE_LIMITED", "Too many requests. Please wait a moment.")

    def body_limit(path: str) -> int:
        # Routes that stream their body with their own cap get a little headroom here, so they answer
        # with their own error; every other route keeps the small JSON cap.
        if path == "/api/voice/transcribe":
            return settings.voice_max_audio_bytes + 4096
        if path.startswith("/api/designs"):
            return designs.MAX_BODY_BYTES + 4096
        return ROUTE_BODY_LIMITS.get(path, MAX_BODY_BYTES)

    app.add_middleware(BodyLimitMiddleware, limit_for=body_limit)
    # Added last, so it is the outermost layer: early answers (413, 429) still carry CORS headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type", "If-Match"],
        expose_headers=["Content-Disposition"],  # the PDF export filename
    )

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, __: Exception) -> JSONResponse:
        return envelope(500, "INTERNAL_ERROR", "Something went wrong.")  # no internals leaked

    app.include_router(health.router)
    app.include_router(reference.router)  # before designs: /designs/default must win over /designs/{id}
    app.include_router(designs.router)
    app.include_router(agent.router)
    app.include_router(voice.router)
    app.include_router(export.router)
    return app


app = create_app()
