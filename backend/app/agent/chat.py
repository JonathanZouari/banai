"""One chat turn: the system prompt, the conversation so far, the Jerusalem weather tool and, when the
design is sent along, the design context and the propose_changes tool (signed proposals, ADR-020).
"""

import json
import logging
import re
from dataclasses import dataclass

import openai

from app.advice.rules import advisories
from app.agent.models import chat_model_for
from app.agent.prompts import SYSTEM_PROMPT, design_context
from app.agent.proposals import MAX_SUMMARY, sign
from app.agent.weather import get_jerusalem_weather
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError

WEATHER_TOOL_NAME = "get_jerusalem_weather"
WEATHER_TOOL = {
    "type": "function",
    "name": WEATHER_TOOL_NAME,
    "description": "Current weather in Jerusalem, Israel. The only weather the assistant may report.",
    "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    "strict": True,
}
MAX_TOOL_ROUNDS = 2

PROPOSE_TOOL_NAME = "propose_changes"
PROPOSE_TOOL = {
    "type": "function",
    "name": PROPOSE_TOOL_NAME,
    "description": "Propose a change to the customer's current design as BanAI ops (see OPS). The customer "
                   "confirms or cancels it in the app; nothing changes before that. At most once per answer.",
    "parameters": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "One short sentence, in the customer's language: what changes."},
            "ops": {"type": "array", "items": {"type": "object"}, "description": "The ops, in order."},
        },
        "required": ["summary", "ops"],
        "additionalProperties": False,
    },
    "strict": False,  # ops are a large union; the engine validates them instead
}
_UNSAFE_TEXT = re.compile(r"[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]")


def make_proposer(design: dict, revision: int, catalog: dict, holder: dict):
    """The propose_changes tool for one turn. Only ops the engine accepts on this design are signed;
    otherwise the model gets the engine error (code, path, message) and may try once more."""
    def propose(raw_arguments: str) -> dict:
        try:
            arguments = json.loads(raw_arguments or "{}")
        except json.JSONDecodeError:
            return {"ok": False, "error": {"code": "SCHEMA_INVALID", "path": "arguments", "message": "arguments must be JSON"}}
        summary = arguments.get("summary") if isinstance(arguments, dict) else None
        ops = arguments.get("ops") if isinstance(arguments, dict) else None
        if not isinstance(summary, str) or not summary.strip():
            return {"ok": False, "error": {"code": "SCHEMA_INVALID", "path": "summary", "message": "give a one-sentence summary"}}
        try:
            apply_ops(design, ops, catalog)  # parse + every op + full validation; never sign a broken change
        except DomainError as error:
            return {"ok": False, "error": error.to_dict()}
        summary = _UNSAFE_TEXT.sub(" ", summary).strip()[:MAX_SUMMARY]
        holder["proposal"] = sign(ops, summary, revision, design)
        return {"ok": True, "note": "The proposal is ready; the customer will confirm or cancel it."}
    return propose


logger = logging.getLogger("banai.agent")


@dataclass(frozen=True)
class ChatResult:
    reply: str
    model: str
    proposal: dict | None = None


class AgentError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def run_chat(client, model: str, messages: list[dict], weather=get_jerusalem_weather, context: str | None = None,
             propose=None) -> str:
    """Calls the model (Responses API), runs at most MAX_TOOL_ROUNDS of weather lookups, returns the reply.

    store=False: OpenAI keeps no copy of the conversation. Function calls are echoed back without
    their item ids, so no stored reasoning items are needed between rounds.
    """
    items = list(messages)
    if context:  # the current design, just before the customer's latest message
        items = items[:-1] + [{"role": "developer", "content": context}] + items[-1:]
    tools = [WEATHER_TOOL] + ([PROPOSE_TOOL] if propose else [])
    weather_result = None
    for round_number in range(MAX_TOOL_ROUNDS + 1):
        last_round = round_number == MAX_TOOL_ROUNDS
        response = client.responses.create(
            model=model, instructions=SYSTEM_PROMPT, input=items, tools=tools,
            tool_choice="none" if last_round else "auto", store=False,
        )
        calls = [item for item in response.output if item.type == "function_call"]
        if not calls:
            return (response.output_text or "").strip()
        for call in calls:
            if call.name == WEATHER_TOOL_NAME:
                weather_result = weather_result or weather()
                result = weather_result
            elif call.name == PROPOSE_TOOL_NAME and propose:
                result = propose(call.arguments)
            else:
                result = {"error": "Unknown tool."}
            items.append({"type": "function_call", "call_id": call.call_id, "name": call.name, "arguments": call.arguments})
            items.append({"type": "function_call_output", "call_id": call.call_id, "output": json.dumps(result, ensure_ascii=False)})
    return ""


def to_agent_error(error: openai.OpenAIError) -> AgentError:
    """Maps SDK errors to our codes. OpenAI's own messages are dropped: they can echo part of the key."""
    if isinstance(error, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return AgentError(401, "INVALID_KEY", "OpenAI rejected the API key. Check it in AI settings.")
    if isinstance(error, openai.NotFoundError):
        return AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key cannot use the chat model.")
    if isinstance(error, openai.RateLimitError):
        return AgentError(429, "OPENAI_RATE_LIMIT", "OpenAI is rate-limiting this key or its quota is used up. Try again later.")
    return AgentError(502, "UPSTREAM", "The AI service is unavailable right now. Try again in a moment.")


def describe_error(error: openai.OpenAIError, model: str | None) -> str:
    """Key-free summary for the server log: class, HTTP status and OpenAI's error code/type/param.

    The message is logged only for 400s: request errors describe our parameters, never the key
    (key problems are 401s, whose messages can echo part of it).
    """
    body = getattr(error, "body", None)
    details = {k: body.get(k) for k in ("code", "type", "param")} if isinstance(body, dict) else {}
    if isinstance(error, openai.BadRequestError) and isinstance(body, dict):
        details["message"] = str(body.get("message", ""))[:300]
    return f"{type(error).__name__} status={getattr(error, 'status_code', None)} model={model} {details}"


def answer(api_key: str, messages: list[dict], configured_model: str | None, client_factory=openai.OpenAI,
           design: dict | None = None, revision: int | None = None) -> ChatResult:
    """One turn. With a canonical `design` (and its `revision`) the agent sees it and may propose signed ops."""
    holder: dict = {"proposal": None}
    context = propose = None
    if design is not None:
        catalog = load_catalog()
        context = design_context(design, revision, advisories(design, catalog), catalog)
        propose = make_proposer(design, revision, catalog, holder)
    client = client_factory(api_key=api_key, timeout=45.0, max_retries=1)
    model = None
    try:
        model = chat_model_for(client, api_key, configured_model)
        if not model:
            raise AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key has no chat model available.")
        reply = run_chat(client, model, messages, context=context, propose=propose)
    except openai.OpenAIError as error:
        logger.warning("Chat turn failed: %s", describe_error(error, model))
        raise to_agent_error(error) from None
    finally:
        client.close()
    if not reply:
        raise AgentError(502, "EMPTY_REPLY", "The AI returned an empty answer. Please try again.")
    return ChatResult(reply, model, holder["proposal"])
