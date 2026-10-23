"""One agent turn: OpenAI tool calling -> parsed ops -> dry run -> (repair x2) -> proposal ops.

The agent never applies anything. It returns either a reply (answer, question or clarification) or a
validated, id-complete op batch; signing and the apply/stale protocol live in the API layer."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

from app.agent.explain import explain_design
from app.agent.language import EMPTY_REPLY, FALLBACK_REPLY, OFF_TOPIC_REPLY, Language, reply_language
from app.agent.prompts import build_system_prompt
from app.agent.proposal import complete_and_validate
from app.agent.tools import CLARIFY, DECLINE, EXPLAIN, MAX_QUESTION, OP_NAMES, TOOLS
from app.domain.errors import INVALID_OP, SCHEMA_INVALID, DomainError

MAX_REPAIRS = 2  # extra model calls after a rejected batch
MAX_TURN_SECONDS = 60  # no repair call starts after this (a request holds a worker thread)
MAX_COMPLETION_TOKENS = 4000
MAX_REPLY = 1000
MAX_PLAIN_REPLY = 400  # an answer without tool calls is a short wardrobe answer or a refusal
MAX_ARGUMENT_CHARS = 20_000

CONTINUE_AFTER_CREATE = (
    "OK: the new wardrobe exists with the compartment ids you gave. Now call the tools for everything else the customer "
    "asked for (shelves, hanging rails, drawers, doors, colours), using those ids, all in this one response. "
    "If the customer described nothing more, reply with the single word DONE and no tool calls."
)


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


def _focus(call) -> str | None:
    """The optional focus of an explain_design call; a malformed call just gets the overview."""
    try:
        focus = _arguments(call, 0).get("focus")
    except DomainError:
        return None
    return focus if isinstance(focus, str) else None


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


def run_agent(
    client, model: str, design: dict, history: list[dict], catalog: dict, temperature: float | None = None,
    mode: str = "free", language: Language = "en",
) -> AgentResult:
    """`history` is [{role: user|assistant, content}] ending with the customer's latest message. Fixed texts and
    the reply language follow the language of that message; `language` (the chat's choice) is the fallback."""
    language = reply_language(history, language)
    fallback = FALLBACK_REPLY[language]
    conversation = [{"role": "system", "content": build_system_prompt(design, catalog, mode, language)}, *history]
    started = time.monotonic()
    repairs = 0
    rounds = 0
    carried: list[dict] = []  # ops from an earlier round of this turn (see CONTINUE_AFTER_CREATE)
    continued = False
    while True:
        if rounds and time.monotonic() - started > MAX_TURN_SECONDS:
            return AgentResult(reply=fallback, warnings=["turn time budget exceeded"])
        rounds += 1
        options = {} if temperature is None else {"temperature": temperature}
        completion = client.chat.completions.create(
            model=model, messages=conversation, tools=TOOLS, max_completion_tokens=MAX_COMPLETION_TOKENS, **options,
        )
        message = completion.choices[0].message
        all_calls = message.tool_calls or []
        declined = any(c.function.name == DECLINE for c in all_calls)
        explain = next((c for c in all_calls if c.function.name == EXPLAIN), None)
        calls = [c for c in all_calls if c.function.name not in (DECLINE, EXPLAIN)]
        text = _clip(message.content, MAX_REPLY)
        if declined and not calls and not carried:
            return AgentResult(reply=OFF_TOPIC_REPLY[language])  # fixed text: never model-written
        if explain is not None and not calls and not carried:
            # Read-only: the description is built by the server from the current design, and no ops come back.
            return AgentResult(reply=explain_design(design, _focus(explain), language))
        if not calls:
            if carried:  # the model had nothing to add after create_wardrobe
                try:
                    ops, final = complete_and_validate(design, carried, catalog)
                except DomainError as error:
                    return AgentResult(reply=fallback, warnings=[str(error)])
                return AgentResult(reply="" if text.strip(" .!").upper() == "DONE" else _clip(text, MAX_PLAIN_REPLY), ops=ops, design=final)
            return AgentResult(reply=_clip(text, MAX_PLAIN_REPLY) or EMPTY_REPLY[language])

        question = next((c for c in calls if c.function.name == CLARIFY), None)
        if question is not None:
            try:
                asked = _clip(str(_arguments(question, 0).get("question", "")), MAX_QUESTION)
            except DomainError:
                asked = ""
            return AgentResult(reply=asked or text or EMPTY_REPLY[language])

        try:
            batch = carried + _raw_ops(calls)
            if not continued and [op["op"] for op in batch] == ["create_wardrobe"]:
                # The model tends to send create_wardrobe alone and expect a second step. Give it that step once.
                continued, carried = True, batch
                conversation.append(_assistant_message(message))
                conversation.extend({"role": "tool", "tool_call_id": c.id, "content": CONTINUE_AFTER_CREATE} for c in all_calls)
                continue
            ops, final = complete_and_validate(design, batch, catalog)
        except DomainError as error:
            if repairs == MAX_REPAIRS:
                return AgentResult(reply=fallback, warnings=[str(error)])
            repairs += 1
            carried, continued = [], True  # the model now redoes the whole request in one go
            conversation.append(_assistant_message(message))
            feedback = f"REJECTED, nothing was changed: {error}. Fix the arguments and call the tools again for the whole request."
            conversation.extend({"role": "tool", "tool_call_id": c.id, "content": feedback} for c in all_calls)
            continue
        return AgentResult(reply=_clip(text, MAX_PLAIN_REPLY), ops=ops, design=final)  # short: it is signed and may be read aloud
