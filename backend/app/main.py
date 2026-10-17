from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi.middleware import SlowAPIMiddleware

from app.api import chat, health, proposals, reference, voice
from app.api.envelope import fail
from app.api.limits import BodyLimitMiddleware, limiter, rate_limit_handler
from app.config import get_settings


def _validation_failed(_request, _error: RequestValidationError):
    # Never echo the rejected input back (it may be large or crafted).
    return fail(422, "INVALID_REQUEST", "The request is not valid.")


def _http_failed(_request, error: StarletteHTTPException):
    return fail(error.status_code, "HTTP_ERROR", "The request could not be processed.")


def _unexpected_failure(_request, _error: Exception):
    return fail(500, "INTERNAL_ERROR", "Something went wrong on the server.")


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
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    app.add_exception_handler(RequestValidationError, _validation_failed)
    app.add_exception_handler(StarletteHTTPException, _http_failed)
    app.add_exception_handler(Exception, _unexpected_failure)
    # The last middleware added is the outermost: CORS wraps everything, so even a 413 carries its headers.
    app.add_middleware(
        BodyLimitMiddleware,
        max_bytes=settings.max_body_bytes,
        path_limits={"/api/voice/transcribe": settings.max_audio_bytes},
    )
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type", "If-Match"],
    )
    app.include_router(health.router)
    app.include_router(reference.router)
    app.include_router(chat.router)
    app.include_router(proposals.router)
    app.include_router(voice.router)
    return app


app = create_app()
