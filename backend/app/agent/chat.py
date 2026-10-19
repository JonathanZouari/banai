"""One chat turn: the system prompt, the conversation so far, OpenAI's web search (carpentry facts, standards
and ideas, with their sources) and, when the design is sent along, the design context and the propose_changes
tool (signed proposals, ADR-020). Carpentry only: there is no off-topic tool (the weather exception is gone).
"""

import json
import logging
import re
from dataclasses import dataclass

import openai

from app.advice.rules import advisories
from app.agent.models import chat_model_for
from app.agent.prompts import LANGUAGE_NAMES, SPOKEN_NOTE, SYSTEM_PROMPT, design_context, language_note
from app.agent.proposals import MAX_SUMMARY, sign
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.errors import DomainError

# OpenAI runs the search itself, inside the call; the reply carries url_citation annotations. Low context keeps
# each search cheap. Page text is third-party data: the prompt says never to follow it (WEB SEARCH).
WEB_SEARCH_TOOL = {"type": "web_search", "search_context_size": "low"}
MAX_TOOL_ROUNDS = 2
MAX_SOURCES = 6
MAX_BUILT_IN_CALLS = 3  # web searches per model call: each is billed to the customer's key

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
# A web page's title: also no invisible or bidi marks (as SAFE_TEXT_PATTERN) and no tag characters.
_UNSAFE_TITLE = re.compile(
    r"[\x00-\x1f\x7f-\x9f\u00ad\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\U000e0000-\U000e007f]")
_URL = re.compile(r"https?://[^\s]{1,2000}")
# Inline citations the model writes as Markdown: "([title](url))" or "[title](url)". The chat shows plain text, so
# they are taken out of the reply and the sources are listed under it instead.
_CITED = re.compile(r"\s*\(\[([^\]]{0,300})\]\((https?://[^)\s]{1,2000})\)\)")
_LINK = re.compile(r"\[([^\]]{0,300})\]\((https?://[^)\s]{1,2000})\)")


def clean_reply(text: str) -> str:
    """The reply without Markdown citation links (the sources are listed separately)."""
    text = _CITED.sub("", text or "")
    text = _LINK.sub(lambda m: m.group(1), text)
    return re.sub(r"[ \t]+([.,;:!?])", r"\1", text).strip()


def sources_of(response) -> list[dict]:
    """The web sources a reply cites: [{title, url}], https/http only, cleaned, unique, at most MAX_SOURCES."""
    found: list[dict] = []
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) != "message":
            continue
        for part in getattr(item, "content", None) or []:
            for note in getattr(part, "annotations", None) or []:
                if getattr(note, "type", None) != "url_citation":
                    continue
                url = str(getattr(note, "url", "") or "")
                if not _URL.fullmatch(url) or any(s["url"] == url for s in found):
                    continue
                title = " ".join(_UNSAFE_TITLE.sub(" ", str(getattr(note, "title", "") or "")).split())[:120]
                found.append({"title": title or url, "url": url})
    return found[:MAX_SOURCES]


def normalise_ops(value):
    """The ops as the browser will send them back: integral floats become ints (JSON in JavaScript has
    one number type, so 2400.0 returns as 2400 and would break the signature). Strings that cannot be
    encoded as UTF-8 (a lone surrogate) raise ValueError."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        value.encode("utf-8")  # UnicodeEncodeError (a ValueError) on a lone surrogate
        return value
    if isinstance(value, list):
        return [normalise_ops(item) for item in value]
    if isinstance(value, dict):
        return {normalise_ops(key): normalise_ops(item) for key, item in value.items()}
    return value


def restore_names(ops: list, design: dict) -> list:
    """The model never sees household names (prompts.private_view), so set_household from it keeps each existing
    person's name at their position when it gives none."""
    names = [p.get("name") for p in ((design.get("household") or {}).get("people") or [])]
    out = []
    for op in ops:
        if isinstance(op, dict) and op.get("op") == "set_household" and isinstance(op.get("people"), list):
            people = [{**p, "name": names[i]} if isinstance(p, dict) and p.get("name") is None and i < len(names) and names[i]
                      else p for i, p in enumerate(op["people"])]
            op = {**op, "people": people}
        out.append(op)
    return out


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
            ops = normalise_ops(ops)
            summary = normalise_ops(summary)
            if isinstance(ops, list):
                ops = restore_names(ops, design)
        except ValueError:
            return {"ok": False, "error": {"code": "SCHEMA_INVALID", "path": "arguments", "message": "text must be valid Unicode"}}
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
    sources: tuple = ()  # the web pages the reply cites: ({title, url}, ...)


class AgentError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def run_chat(client, model: str, messages: list[dict], context: str | None = None, propose=None,
             web: bool = True) -> tuple[str, list[dict]]:
    """Calls the model (Responses API) with web search and, when given, propose_changes; runs at most
    MAX_TOOL_ROUNDS of proposals. Returns (reply, sources). A model or key without web search is asked again
    without it (the reply then has no sources).

    store=False: OpenAI keeps no copy of the conversation. Function calls are echoed back without
    their item ids, so no stored reasoning items are needed between rounds.
    """
    items = list(messages)
    if context:  # the current design, just before the customer's latest message
        items = items[:-1] + [{"role": "developer", "content": context}] + items[-1:]
    sources: list[dict] = []
    round_number = 0
    while round_number <= MAX_TOOL_ROUNDS:
        last_round = round_number == MAX_TOOL_ROUNDS
        tools = ([WEB_SEARCH_TOOL] if web else []) + ([PROPOSE_TOOL] if propose else [])
        request = {"model": model, "instructions": SYSTEM_PROMPT, "input": items, "store": False}
        if tools:
            request |= {"tools": tools, "tool_choice": "none" if last_round else "auto"}
        if web:
            request["max_tool_calls"] = MAX_BUILT_IN_CALLS
        try:
            response = client.responses.create(**request)
        except openai.BadRequestError as error:
            if not web or not _refused_tool(error):
                raise
            logger.info("Web search unavailable, answering without it: %s", describe_error(error, model))
            web = False
            continue  # the same round again, without web search
        sources += [s for s in sources_of(response) if all(s["url"] != t["url"] for t in sources)]
        calls = [item for item in response.output if item.type == "function_call"]
        if not calls:
            return clean_reply(response.output_text or ""), sources[:MAX_SOURCES]
        for call in calls:
            result = propose(call.arguments) if call.name == PROPOSE_TOOL_NAME and propose else {"error": "Unknown tool."}
            items.append({"type": "function_call", "call_id": call.call_id, "name": call.name, "arguments": call.arguments})
            items.append({"type": "function_call_output", "call_id": call.call_id, "output": json.dumps(result, ensure_ascii=False)})
        round_number += 1
    return "", sources[:MAX_SOURCES]


def _refused_tool(error) -> bool:
    """A 400 about the web search tool itself (a model or key without it), not about anything else."""
    body = getattr(error, "body", None)
    detail = body.get("error", body) if isinstance(body, dict) else {}
    param = str((detail or {}).get("param") or "") if isinstance(detail, dict) else ""
    text = f"{param} {error}".lower()
    return param.startswith("tools") or "web_search" in text or "max_tool_calls" in text


def to_agent_error(error: openai.OpenAIError) -> AgentError:
    """Maps SDK errors to our codes. OpenAI's own messages are dropped: they can echo part of the key."""
    if isinstance(error, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return AgentError(401, "INVALID_KEY", "OpenAI rejected the API key. Check it in AI settings.")
    if isinstance(error, openai.NotFoundError):
        return AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key cannot use the chat model.")
    if isinstance(error, openai.RateLimitError):
        return AgentError(429, "OPENAI_RATE_LIMIT", "OpenAI is rate-limiting this key or its quota is used up. Try again later.")
    return AgentError(502, "UPSTREAM", "The AI service is unavailable right now. Try again in a moment.")


def describe_error(error: openai.OpenAIError, model: str | None, with_message: bool = True) -> str:
    """Key-free summary for the server log: class, HTTP status and OpenAI's error code/type/param.

    The message is logged only for 400s: request errors describe our parameters, never the key
    (key problems are 401s, whose messages can echo part of it).
    """
    body = getattr(error, "body", None)
    details = {k: body.get(k) for k in ("code", "type", "param")} if isinstance(body, dict) else {}
    if with_message and isinstance(error, openai.BadRequestError) and isinstance(body, dict):
        details["message"] = str(body.get("message", ""))[:300]
    return f"{type(error).__name__} status={getattr(error, 'status_code', None)} model={model} {details}"


def answer(api_key: str, messages: list[dict], configured_model: str | None, client_factory=openai.OpenAI,
           design: dict | None = None, revision: int | None = None, spoken: bool = False,
           language: str | None = None) -> ChatResult:
    """One turn. With a canonical `design` (and its `revision`) the agent sees it and may propose signed ops.
    `spoken`: the customer spoke and will hear the reply, so it is written for the ear (ADR-028).
    `language`: the session language the customer picked (ADR-029); None keeps "reply in their language"."""
    holder: dict = {"proposal": None}
    context = propose = None
    if design is not None:
        catalog = load_catalog()
        context = design_context(design, revision, advisories(design, catalog), catalog)
        propose = make_proposer(design, revision, catalog, holder)
    notes = ([SPOKEN_NOTE] if spoken else []) + ([language_note(language)] if language in LANGUAGE_NAMES else [])
    if notes:
        context = "\n\n".join(([context] if context else []) + notes)
    client = client_factory(api_key=api_key, timeout=45.0, max_retries=1)
    model = None
    try:
        model = chat_model_for(client, api_key, configured_model)
        if not model:
            raise AgentError(400, "MODEL_UNAVAILABLE", "Your OpenAI key has no chat model available.")
        reply, sources = run_chat(client, model, messages, context=context, propose=propose)
    except openai.OpenAIError as error:
        logger.warning("Chat turn failed: %s", describe_error(error, model))
        raise to_agent_error(error) from None
    finally:
        client.close()
    if not reply:
        raise AgentError(502, "EMPTY_REPLY", "The AI returned an empty answer. Please try again.")
    return ChatResult(reply, model, holder["proposal"], tuple(sources))
