from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import advisories, ai_settings, chat, health, reference
from app.body_limit import BodySizeLimitMiddleware
from app.config import get_settings


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
    app.include_router(advisories.router)
    return app


app = create_app()
