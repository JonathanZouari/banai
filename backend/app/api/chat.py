"""POST /api/chat: one agent turn. Returns a reply and, when the agent proposes changes, a signed proposal.

The committed design is never modified here. The proposal is only a signed description of ops that
`/api/proposals/apply` will accept while the design it was made for is still the committed one."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated, Any, Literal

import openai
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.agent.describe import describe_ops
from app.agent.orchestrator import run_agent
from app.api.envelope import fail, ok
from app.api.limits import limiter
from app.config import Settings, get_settings
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.services.signing import SigningUnavailable, design_hash, sign_proposal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

MAX_MESSAGES = 30
MAX_MESSAGE_CHARS = 2000
DEFAULT_REPLY = "Here is what I would change. Review it and confirm to apply."


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: Annotated[str, Field(min_length=1, max_length=MAX_MESSAGE_CHARS)]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: Annotated[list[ChatMessage], Field(min_length=1, max_length=MAX_MESSAGES)]
    design: dict[str, Any]
    revision: Annotated[int, Field(ge=1, le=1_000_000_000, strict=True)]


@lru_cache
def _client(api_key: str) -> openai.OpenAI:
    return openai.OpenAI(api_key=api_key, timeout=30.0, max_retries=0)


def get_agent_client(settings: Annotated[Settings, Depends(get_settings)]) -> openai.OpenAI | None:
    """Overridden in tests with a fake client."""
    return _client(settings.openai_api_key) if settings.openai_api_key else None


@router.post("/chat")
@limiter.limit(lambda: get_settings().chat_rate_limit)
def chat(
    request: Request,  # noqa: ARG001 - required by the rate limiter
    body: ChatRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    client: Annotated[openai.OpenAI | None, Depends(get_agent_client)],
):
    if client is None or not settings.openai_chat_model:
        return fail(503, "AGENT_UNAVAILABLE", "The AI designer is not configured on this server.")
    if body.messages[-1].role != "user":
        return fail(422, "INVALID_MESSAGES", "The last message must come from the customer.")

    catalog = load_catalog()
    try:
        design = apply_ops(body.design, [], catalog)  # full validation; returns the canonical copy
    except DomainError as error:
        return fail(422, error.code, error.message, {"path": error.path})

    history = [{"role": m.role, "content": m.content} for m in body.messages]
    try:
        result = run_agent(
            client, settings.openai_chat_model, design, history, catalog, temperature=settings.openai_temperature
        )
    except openai.OpenAIError as error:
        logger.warning("OpenAI call failed: %s", type(error).__name__)  # never log the request or the key
        return fail(502, "AGENT_ERROR", "The AI designer is unavailable right now. Please try again.")

    if result.warnings:
        logger.info("agent proposal rejected after repairs: %s", result.warnings[0][:200])
    if not result.ops:
        return ok({"reply": result.reply, "proposal": None})

    try:
        base_hash = design_hash(design)
        signature = sign_proposal(result.ops, body.revision, base_hash, settings.proposal_signing_key)
    except SigningUnavailable:
        return fail(503, "AGENT_UNAVAILABLE", "The AI designer is not configured on this server.")
    count = len(result.ops)
    proposal = {
        "id": signature[:16],
        "baseRevision": body.revision,
        "baseHash": base_hash,
        "ops": result.ops,
        "summary": f"{count} {'change' if count == 1 else 'changes'} to your wardrobe",
        "changes": describe_ops(result.ops, design, lambda d, o: apply_ops(d, o, catalog)),
        "signature": signature,
    }
    return ok({"reply": result.reply or DEFAULT_REPLY, "proposal": proposal})
