"""Stateless OpenAI key check. The key lives only on the customer's computer (browser storage):
the server receives it in the request body, checks it with OpenAI and keeps nothing."""

import threading
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.ai.verify import KEY_PATTERN, mask_key, verify_openai_key
from app.config import get_settings

router = APIRouter(prefix="/api/settings/ai")

# A cheap DoS guard on an unauthenticated endpoint: two OpenAI checks at a time per process.
# A request never waits for a slot. Waiting would pin one of the worker threads that every sync
# endpoint shares, so a burst of checks could stall the whole API.
_verify_slots = threading.BoundedSemaphore(2)


class VerifyRequest(BaseModel):
    apiKey: str = Field(max_length=512)


def get_verifier():
    return verify_openai_key


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "data": None, "error": {"code": code, "message": message}},
    )


@router.post("/verify")
def verify_key(body: VerifyRequest, verifier=Depends(get_verifier)):
    api_key = body.apiKey.strip()
    if not KEY_PATTERN.fullmatch(api_key):
        return _error(400, "INVALID_FORMAT", "That doesn't look like an OpenAI API key (it starts with sk-).")
    if not _verify_slots.acquire(blocking=False):
        return _error(429, "BUSY", "Another key check is running. Try again in a moment.")
    try:
        result = verifier(api_key, get_settings().openai_chat_model or None)
    finally:
        _verify_slots.release()
    return {
        "success": True,
        "data": {
            "status": result.status,
            "model": result.model,
            "maskedKey": mask_key(api_key),
            "checkedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        },
    }
