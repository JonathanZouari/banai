"""Agent endpoints: POST /api/chat (signed proposal) and POST /api/proposals/apply."""

from __future__ import annotations

import logging
import time
from collections import deque
from threading import Lock
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from openai import APIError, APITimeoutError, OpenAI, RateLimitError
from pydantic import BaseModel, ConfigDict, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.ai.agent import run_agent
from app.ai.signing import canonical_json, design_hash, verify_proposal
from app.config import Settings, get_settings
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError

logger = logging.getLogger("banai.chat")
router = APIRouter(prefix="/api")
limiter = Limiter(key_func=get_remote_address)

MAX_MESSAGES = 20
MAX_MESSAGE_CHARS = 2000
MAX_DESIGN_BYTES = 200_000


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    design: dict
    revision: int = Field(ge=0, le=1_000_000_000)
    language: Literal["en", "he"] = "en"


class Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ops: list[dict] = Field(min_length=1, max_length=100)
    summary: str = Field(max_length=300)
    baseRevision: int = Field(ge=0, le=1_000_000_000)
    baseHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    signature: str = Field(pattern=r"^[0-9a-f]{64}$")


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    design: dict
    revision: int = Field(ge=0, le=1_000_000_000)
    proposal: Proposal


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _too_big(design: dict) -> bool:
    try:
        return len(canonical_json(design)) > MAX_DESIGN_BYTES
    except RecursionError:
        return True


_recent: deque[float] = deque()
_recent_lock = Lock()


def _over_hourly_cap(cap: int) -> bool:
    """Process-wide spend guard (in memory, per worker): True when `cap` requests already ran this hour."""
    now = time.monotonic()
    with _recent_lock:
        while _recent and now - _recent[0] > 3600:
            _recent.popleft()
        if len(_recent) >= cap:
            return True
        _recent.append(now)
        return False


def get_chat_client(settings: Annotated[Settings, Depends(get_settings)]):
    if not settings.agent_configured:
        raise _error(503, "AGENT_NOT_CONFIGURED", "The AI agent is not configured on the server.")
    client = OpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=settings.chat_timeout_s, max_retries=1)
    return client.chat.completions


@router.post("/chat")
@limiter.limit(lambda: get_settings().chat_rate_limit)
def chat(
    request: Request,
    body: ChatRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    client=Depends(get_chat_client),
) -> dict:
    if _too_big(body.design):
        raise _error(413, "DESIGN_TOO_LARGE", "The design is too large.")
    if _over_hourly_cap(settings.chat_hourly_cap):
        raise _error(429, "AGENT_BUSY", "The AI service is busy right now. Please try again later.")
    catalog = load_catalog()
    try:
        result = run_agent(
            client=client,
            model=settings.openai_chat_model,
            signing_key=settings.proposal_signing_key.get_secret_value(),
            messages=[m.model_dump() for m in body.messages],
            design=body.design,
            revision=body.revision,
            catalog=catalog,
            language=body.language,
        )
    except DomainError as error:
        raise _error(422, error.code, "The current design is not valid.") from None
    except RateLimitError as error:
        logger.warning("OpenAI rate limit: %s", getattr(error, "code", None))
        if getattr(error, "code", None) == "insufficient_quota":
            raise _error(503, "AGENT_QUOTA", "The AI service has run out of credits. Please contact the site owner.") from None
        raise _error(429, "AGENT_BUSY", "The AI service is at its usage limit. Please try again in a few minutes.") from None
    except APITimeoutError:
        raise _error(504, "AGENT_TIMEOUT", "The AI agent took too long. Please try again.") from None
    except APIError as error:
        logger.warning("OpenAI error: %s", type(error).__name__)  # never log request bodies or keys
        raise _error(502, "AGENT_UNAVAILABLE", "The AI agent is unavailable. Please try again.") from None
    return {"success": True, "data": {"reply": result.reply, "proposal": result.proposal}}


@router.post("/proposals/apply")
@limiter.limit(lambda: get_settings().chat_rate_limit)
def apply_proposal(request: Request, body: ApplyRequest, settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    if not settings.agent_configured:
        raise _error(503, "AGENT_NOT_CONFIGURED", "The AI agent is not configured on the server.")
    if _too_big(body.design):
        raise _error(413, "DESIGN_TOO_LARGE", "The design is too large.")
    p = body.proposal
    key = settings.proposal_signing_key.get_secret_value()
    if not verify_proposal(key, p.ops, p.baseRevision, p.baseHash, p.signature):
        raise _error(403, "BAD_SIGNATURE", "This proposal is not valid.")
    if body.revision != p.baseRevision or design_hash(body.design) != p.baseHash:
        raise _error(409, "STALE", "Design changed. Ask the agent to re-propose.")
    try:
        new_design = apply_ops(body.design, p.ops, load_catalog())
    except DomainError as error:
        raise _error(422, error.code, error.message) from None
    return {"success": True, "data": {"design": new_design, "revision": body.revision + 1}}
