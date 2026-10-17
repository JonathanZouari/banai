"""POST /api/chat: one agent turn. The OpenAI key comes from the customer's browser with each request
and is never stored or logged here."""

import threading
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.limits import too_many_nodes
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError
from app.domain.schema import parse_design
from app.domain.validation import validate_canonical

from app.agent.chat import AgentError, answer
from app.ai.verify import KEY_PATTERN
from app.config import get_settings

router = APIRouter(prefix="/api")

MAX_MESSAGE_LENGTH = 2000  # matches the composer limit in frontend/src/chat/chatModel.js
MAX_HISTORY = 40
# A cheap DoS guard on an unauthenticated endpoint: a few agent turns at a time per process.
# A request never waits for a slot: waiting would pin a worker thread shared by every sync endpoint.
_slots = threading.BoundedSemaphore(4)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


class ChatRequest(BaseModel):
    apiKey: str = Field(max_length=512)
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_HISTORY)
    # With the design, the agent sees it and may propose signed changes (ADR-020).
    design: dict | None = None
    revision: int | None = Field(default=None, ge=1)
    # The customer spoke this message and will hear the reply (ADR-028): the agent answers for the ear.
    spoken: bool = False
    # The session language the customer picked (ADR-029). Without it the agent answers in the customer's language.
    language: Literal["he", "en", "ru", "ar"] | None = None


def get_chat_runner():
    return answer


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "data": None, "error": {"code": code, "message": message}},
    )


@router.post("/chat")
def chat(body: ChatRequest, runner=Depends(get_chat_runner)):
    api_key = body.apiKey.strip()
    if not KEY_PATTERN.fullmatch(api_key):
        return _error(400, "INVALID_FORMAT", "Add a valid OpenAI API key in AI settings.")
    if body.messages[-1].role != "user":
        return _error(400, "INVALID_HISTORY", "The last message must come from the customer.")
    design = None
    if body.design is not None:
        if body.revision is None:
            return _error(400, "INVALID_REVISION", "A design needs its revision.")
        if too_many_nodes(body.design):
            return _error(422, "SCHEMA_INVALID", "The design is too large.")
        try:
            design = parse_design(body.design)
        except DomainError as error:
            return _error(422, error.code, error.message)
        issues = validate_canonical(design, load_catalog())
        if issues:
            return _error(422, issues[0].code, issues[0].message)
    if not _slots.acquire(blocking=False):
        return _error(429, "BUSY", "The AI designer is busy. Try again in a moment.")
    try:
        messages = [{"role": m.role, "content": m.content} for m in body.messages]
        model = get_settings().openai_chat_model or None
        extra = ({"spoken": True} if body.spoken else {}) | ({"language": body.language} if body.language else {})
        result = (runner(api_key, messages, model, design=design, revision=body.revision, **extra) if design is not None
                  else runner(api_key, messages, model, **extra))
    except AgentError as error:
        return _error(error.status_code, error.code, error.message)
    finally:
        _slots.release()
    data = {"reply": result.reply, "model": result.model}
    if result.proposal is not None:
        data["proposal"] = result.proposal
    return {"success": True, "data": data}
