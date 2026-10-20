"""Chat agent: OpenAI tool calls -> validated ops -> dry run -> signed proposal.

The model only ever proposes. Every op list is parsed with the domain Pydantic models and dry-run
against a copy of the design; invalid output is fed back for up to MAX_REPAIRS repairs.
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.ai.prompt import build_system_message
from app.ai.signing import design_hash, sign_proposal
from app.domain import ops as op_types
from app.domain.apply import apply_ops
from app.domain.errors import DomainError

MAX_REPAIRS = 2
MAX_SUMMARY = 300
MAX_REPLY = 1500
MAX_OUTPUT_TOKENS = 1500

def _clean(node: Any) -> Any:
    """Drop pydantic noise (titles, defaults, bound keys) so the model sees a compact schema."""
    if isinstance(node, dict):
        return {k: _clean(v) for k, v in node.items() if k not in {"title", "default", "ge", "le", "discriminator"}}
    if isinstance(node, list):
        return [_clean(v) for v in node]
    return node


def _op_schema() -> tuple[dict, dict]:
    raw = op_types._OP_ADAPTER.json_schema(by_alias=True)
    return {"oneOf": _clean(raw["oneOf"])}, _clean(raw["$defs"])


_OP_ITEMS, _OP_DEFS = _op_schema()

PROPOSE_TOOL = {
    "type": "function",
    "function": {
        "name": "propose_changes",
        "description": "Propose a batch of design changes for the customer to confirm. Never applied automatically.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "One short sentence describing the change."},
                "ops": {
                    "type": "array",
                    "description": 'Each item is an object with an "op" field, e.g. {"op":"update_dimensions","width":3000}.',
                    "items": _OP_ITEMS,
                    "minItems": 1,
                    "maxItems": 30,
                },
            },
            "required": ["summary", "ops"],
            "$defs": _OP_DEFS,
        },
    },
}
CLARIFY_TOOL = {
    "type": "function",
    "function": {
        "name": "ask_clarification",
        "description": "Ask the customer one short question when the request is ambiguous or impossible.",
        "parameters": {
            "type": "object",
            "properties": {"question": {"type": "string"}},
            "required": ["question"],
        },
    },
}
TOOLS = [PROPOSE_TOOL, CLARIFY_TOOL]

FALLBACK_CLARIFICATION = {
    "en": "I couldn't turn that into a valid change. Could you rephrase it or give the exact sizes you want?",
    "he": "לא הצלחתי להפוך את הבקשה לשינוי תקין. אפשר לנסח אותה מחדש או לציין מידות מדויקות?",
}
DEFAULT_SUMMARY = {"en": "Proposed design changes", "he": "שינויים מוצעים בעיצוב"}
LANGUAGE_REMINDER = {
    "en": "Your text was not in English. Answer ONLY in English.",
    "he": "Your text was not in Hebrew. Answer ONLY in Hebrew.",
}
# Letters must belong to these scripts. Hebrew replies may carry Latin (catalog ids, "cm").
ALLOWED_SCRIPTS = {"en": {"LATIN"}, "he": {"HEBREW", "LATIN"}}


def off_language(text: str | None, language: str) -> bool:
    """True when `text` has a letter outside the scripts allowed for `language` (e.g. Cyrillic)."""
    allowed = ALLOWED_SCRIPTS[language]
    for ch in text or "":
        if ch.isalpha() and unicodedata.name(ch, "").split(" ")[0] not in allowed:
            return True
    return False


class ChatClient(Protocol):
    def create(self, **kwargs: Any) -> Any: ...


@dataclass
class AgentResult:
    reply: str
    proposal: dict | None = None
    attempts: int = 1
    errors: list[str] = field(default_factory=list)


def _clip(text: str | None, limit: int) -> str:
    return (text or "").strip()[:limit]


def run_agent(
    *,
    client: ChatClient,
    model: str,
    signing_key: str,
    messages: list[dict],
    design: dict,
    revision: int,
    catalog: dict,
    language: str = "en",
    units: str = "cm",
) -> AgentResult:
    convo: list[dict] = [
        {"role": "system", "content": build_system_message(design, catalog, language, units)},
        *messages,
    ]
    fallback = FALLBACK_CLARIFICATION[language]
    base_hash = design_hash(design)
    errors: list[str] = []

    for attempt in range(1, MAX_REPAIRS + 2):
        completion = client.create(model=model, messages=convo, tools=TOOLS, temperature=0.2, max_tokens=MAX_OUTPUT_TOKENS)
        message = completion.choices[0].message
        calls = message.tool_calls or []
        if not calls:
            text = _clip(message.content, MAX_REPLY)
            if text and off_language(text, language):
                errors.append("reply in wrong language")
                if attempt <= MAX_REPAIRS:
                    convo += [{"role": "assistant", "content": text}, {"role": "user", "content": LANGUAGE_REMINDER[language]}]
                    continue
                text = ""
            return AgentResult(text or fallback, None, attempt, errors)

        call = calls[0]  # one action per turn
        try:
            args = json.loads(call.function.arguments or "{}")
        except json.JSONDecodeError:
            args = None

        if call.function.name == "ask_clarification":
            question = _clip(args.get("question") if isinstance(args, dict) else None, MAX_REPLY)
            if question and off_language(question, language):
                errors.append("question in wrong language")
                if attempt <= MAX_REPAIRS:
                    convo += [_assistant_call(message, call), _tool_result(call, LANGUAGE_REMINDER[language])]
                    continue
                question = ""
            return AgentResult(question or fallback, None, attempt, errors)

        problem = _check_proposal(args, design, catalog)
        text = _clip(message.content, MAX_REPLY)
        summary_text = _clip(args.get("summary"), MAX_SUMMARY) if isinstance(args, dict) else ""
        wrong_language = off_language(text, language) or off_language(summary_text, language)
        if problem is None and wrong_language and attempt <= MAX_REPAIRS:
            problem = LANGUAGE_REMINDER[language]
        if problem is None:
            ops = args["ops"]
            summary = summary_text or DEFAULT_SUMMARY[language]
            if wrong_language:  # still wrong after the repairs: keep the valid ops, drop the foreign text
                summary, text = DEFAULT_SUMMARY[language], ""
            proposal = {
                "ops": ops,
                "summary": summary,
                "baseRevision": revision,
                "baseHash": base_hash,
                "signature": sign_proposal(signing_key, ops, revision, base_hash),
            }
            reply = text or summary
            return AgentResult(reply, proposal, attempt, errors)

        errors.append(problem)
        convo += [_assistant_call(message, call), _tool_result(call, f"Invalid: {problem}. Fix and call again.")]

    return AgentResult(fallback, None, MAX_REPAIRS + 1, errors)


def _assistant_call(message: Any, call: Any) -> dict:
    return {
        "role": "assistant",
        "content": message.content,
        "tool_calls": [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.function.name, "arguments": call.function.arguments},
            }
        ],
    }


def _tool_result(call: Any, content: str) -> dict:
    return {"role": "tool", "tool_call_id": call.id, "content": content}


def _check_proposal(args: object, design: dict, catalog: dict) -> str | None:
    if not isinstance(args, dict) or not isinstance(args.get("ops"), list) or not args["ops"]:
        return "arguments must be an object with a non-empty `ops` array"
    try:
        apply_ops(design, args["ops"], catalog)  # dry run on the engine's own copy
    except DomainError as error:
        return str(error)[:300]
    return None
