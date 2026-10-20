from fastapi import APIRouter

from app.config import get_settings
from app.store import storage_mode

router = APIRouter()


@router.get("/api/health")
def health() -> dict:
    return {"success": True, "data": {"status": "ok", "env": get_settings().app_env,
                                       "storage": storage_mode() != "off"}}
