"""One agent turn: OpenAI tool calling -> parsed ops -> dry run -> (repair x2) -> proposal ops.

The agent never applies anything. It returns either a reply (answer, question or clarification) or a
validated, id-complete op batch; signing and the apply/stale protocol live in the API layer."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.agent.prompts import build_system_prompt
from app.agent.proposal import complete_and_validate
from app.agent.tools import CLARIFY, MAX_QUESTION, OP_NAMES, TOOLS
from app.domain.errors import INVALID_OP, SCHEMA_INVALID, DomainError

MAX_REPAIRS = 2  # extra model calls after a rejected batch
MAX_COMPLETION_TOKENS = 4000
MAX_REPLY = 1000
MAX_ARGUMENT_CHARS = 20_000

CLARIFY_FALLBACK = "I couldn't turn that into a valid change. Could you rephrase it, or give me the exact sizes you want?"
EMPTY_REPLY = "I'm not sure what to change. Could you tell me more about what you want?"


@dataclass
class AgentResult:
    reply: str
    ops: list[dict] | None = None
    design: dict | None = None  # the design the ops would produce (diagnostics and tests)
    warnings: list[str] = field(default_factory=list)


def _clip(text: str | None, limit: int) -> str:
    return (text or "").strip()[:limit]


def _arguments(call, index: int) -> dict:
    raw = call.function.arguments or "{}"
    if len(raw) > MAX_ARGUMENT_CHARS:
        raise DomainError(SCHEMA_INVALID, f"ops[{index}]", "tool arguments are too large")
    try:
        args = json.loads(raw)
    except json.JSONDecodeError:
        raise DomainError(SCHEMA_INVALID, f"ops[{index}]", "tool arguments are not valid JSON") from None
    if not isinstance(args, dict):
        raise DomainError(SCHEMA_INVALID, f"ops[{index}]", "tool arguments must be a JSON object")
    return args


def _raw_ops(calls) -> list[dict]:
    ops = []
    for index, call in enumerate(calls):
        name = call.function.name
        if name not in OP_NAMES:
            raise DomainError(INVALID_OP, f"ops[{index}]", "unknown tool")
        args = _arguments(call, index)
        if "op" in args:
            raise DomainError(SCHEMA_INVALID, f"ops[{index}]", "do not pass 'op'; the tool name is the operation")
        ops.append({"op": name, **args})
    return ops


def _assistant_message(message) -> dict:
    return {
        "role": "assistant",
        "content": message.content,
        "tool_calls": [
            {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments or "{}"}}
            for c in message.tool_calls
        ],
    }


def run_agent(client, model: str, design: dict, history: list[dict], catalog: dict) -> AgentResult:
    """`history` is [{role: user|assistant, content}] ending with the customer's latest message."""
    conversation = [{"role": "system", "content": build_system_prompt(design, catalog)}, *history]
    for attempt in range(MAX_REPAIRS + 1):
        completion = client.chat.completions.create(
            model=model, messages=conversation, tools=TOOLS, max_completion_tokens=MAX_COMPLETION_TOKENS,
        )
        message = completion.choices[0].message
        calls = message.tool_calls or []
        text = _clip(message.content, MAX_REPLY)
        if not calls:
            return AgentResult(reply=text or EMPTY_REPLY)

        question = next((c for c in calls if c.function.name == CLARIFY), None)
        if question is not None:
            try:
                asked = _clip(str(_arguments(question, 0).get("question", "")), MAX_QUESTION)
            except DomainError:
                asked = ""
            return AgentResult(reply=asked or text or EMPTY_REPLY)

        try:
            ops, final = complete_and_validate(design, _raw_ops(calls), catalog)
        except DomainError as error:
            if attempt == MAX_REPAIRS:
                return AgentResult(reply=CLARIFY_FALLBACK, warnings=[str(error)])
            conversation.append(_assistant_message(message))
            feedback = f"REJECTED, nothing was changed: {error}. Fix the arguments and call the tools again for the whole request."
            conversation.extend({"role": "tool", "tool_call_id": c.id, "content": feedback} for c in calls)
            continue
        return AgentResult(reply=text, ops=ops, design=final)
    return AgentResult(reply=CLARIFY_FALLBACK)  # pragma: no cover - the loop always returns
