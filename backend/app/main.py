from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import chat, health, reference
from app.config import get_settings


MAX_BODY_BYTES = 300_000


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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type", "If-Match"],
    )
    app.state.limiter = chat.limiter
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

    @app.middleware("http")
    async def _limit_body(request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return envelope(413, "BODY_TOO_LARGE", "The request is too large.")
        return await call_next(request)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, __: Exception) -> JSONResponse:
        return envelope(500, "INTERNAL_ERROR", "Something went wrong.")  # no internals leaked

    app.include_router(health.router)
    app.include_router(chat.router)
    app.include_router(reference.router)
    return app


app = create_app()
