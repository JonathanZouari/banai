from fastapi import APIRouter

from app.auth.provider import get_auth
from app.config import get_settings
from app.persistence.repository import get_repository

router = APIRouter()


@router.get("/api/health")
def health() -> dict:
    settings = get_settings()
    return {"success": True, "data": {"status": "ok", "env": settings.app_env, "agent": settings.agent_enabled,
                                      "storage": get_repository() is not None,
                                      "accounts": get_auth() is not None and get_repository() is not None}}
