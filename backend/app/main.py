from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import advisories, ai_settings, chat, dossier, health, proposals, reference, voice
from app.body_limit import BodySizeLimitMiddleware
from app.config import get_settings


async def _invalid_request(_request, _error: RequestValidationError) -> JSONResponse:
    """FastAPI's own 422 lists each submitted value ("input"), which can be the customer's OpenAI key.
    This one says only that the request is malformed (security review 2026-10-17, LOW #1/#2)."""
    return JSONResponse(
        status_code=422,
        content={"success": False, "data": None, "error": {"code": "INVALID_REQUEST", "message": "The request is not valid."}},
    )


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
    app.add_exception_handler(RequestValidationError, _invalid_request)
    # Added before CORS so CORS wraps it: a 413 still carries the headers the browser needs to read it.
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type", "If-Match"],
    )
    app.include_router(health.router)
    app.include_router(reference.router)
    app.include_router(ai_settings.router)
    app.include_router(chat.router)
    app.include_router(proposals.router)
    app.include_router(advisories.router)
    app.include_router(dossier.router)
    app.include_router(voice.router)
    return app


app = create_app()
