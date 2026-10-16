"""POST /api/chat: one agent turn. The OpenAI key comes from the customer's browser with each request
and is never stored or logged here."""

import threading
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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
    if not _slots.acquire(blocking=False):
        return _error(429, "BUSY", "The AI designer is busy. Try again in a moment.")
    try:
        messages = [{"role": m.role, "content": m.content} for m in body.messages]
        result = runner(api_key, messages, get_settings().openai_chat_model or None)
    except AgentError as error:
        return _error(error.status_code, error.code, error.message)
    finally:
        _slots.release()
    return {"success": True, "data": {"reply": result.reply, "model": result.model}}
