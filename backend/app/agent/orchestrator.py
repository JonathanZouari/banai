"""One agent turn: OpenAI tool calling -> validated, signed proposal (never applied here).

Flow: the model either answers in text, asks a clarifying question, or proposes ops. Proposed
ops get ids filled in (so replaying an approved proposal is deterministic) and are dry-run on
the domain engine. An invalid batch is sent back to the model to repair, up to MAX_REPAIRS
times; after that the customer gets a clarification message instead of a broken proposal.
"""

from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.agent.language import FALLBACK_REPLY, OFF_TOPIC_REPLY, REMINDER, Language, off_language, reply_language
from app.agent.prompts import DEFAULT_MIN_SHELF_GAP_MM, Units, build_system_prompt
from app.agent.tools import ANSWER, CLARIFY, DECLINE, OFFER, PROPOSE, TOOLS, AnswerArgs, ClarifyArgs, OfferArgs, ProposeArgs
from app.domain import ids
from app.domain.apply import apply_ops
from app.domain.errors import DomainError
from app.services import signing

MAX_REPAIRS = 2
# Token budget: only the latest messages go to the model, and each completion is capped.
# The cap leaves room for the largest realistic batch of ops (a full new wardrobe).
HISTORY_WINDOW = 10
MAX_COMPLETION_TOKENS = 1200

# Add ops whose new-component id fields are filled in before signing.
_ID_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "add_shelf": (("id", ids.SHELF),),
    "add_drawer": (("id", ids.DRAWER),),
    "add_rail": (("id", ids.RAIL),),
    "add_compartment": (("id", ids.COMPARTMENT), ("partitionId", ids.PARTITION)),
    "add_partition": (("id", ids.PARTITION), ("newCompartmentId", ids.COMPARTMENT)),
}


@dataclass(frozen=True)
class TurnResult:
    reply: str
    proposal: dict | None = None
    offer_profile: bool = False  # show the Generate Style Profile (carpenter PDF) step


class AgentUnavailable(Exception):
    """The model provider failed (network, auth, quota...). Never carries provider text."""


def fill_ids(ops: list[dict]) -> list[dict]:
    """Give every new component an explicit id (copies; the input is not modified)."""
    filled = []
    for raw in ops:
        op = dict(raw)
        for field, prefix in _ID_FIELDS.get(op.get("op"), ()):
            if op.get(field) is None:
                op[field] = ids.new_id(prefix)
        if op.get("op") == "create_wardrobe" and isinstance(op.get("compartmentCount"), int):
            count = op["compartmentCount"]
            if op.get("compartmentIds") is None and 1 <= count <= 20:
                op["compartmentIds"] = [ids.new_id(ids.COMPARTMENT) for _ in range(count)]
            if op.get("partitionIds") is None and 1 <= count <= 20:
                op["partitionIds"] = [ids.new_id(ids.PARTITION) for _ in range(count - 1)]
        filled.append(op)
    return filled


def proposal_problem(ops: list[dict], updated: dict, min_shelf_gap: int) -> str | None:
    """Engine-valid batches the customer would still not want; the reason goes back to the model.

    - create_wardrobe after other ops erases what they did (and every existing item) behind a
      summary that reads like a small edit.
    - New shelves closer than `min_shelf_gap` mm (clear space) to another shelf in the same
      compartment, e.g. four shelves stacked at y 0/18/36/54.
    """
    if any(op.get("op") == "create_wardrobe" for op in ops[1:]):
        return ("create_wardrobe replaces the whole design and erases every shelf, drawer, rail and door. "
                "To resize the current wardrobe use update_dimensions only; use create_wardrobe only as the "
                "first op when the customer asks for a new wardrobe.")
    new_shelves = {op["id"] for op in ops if op.get("op") == "add_shelf"}
    for compartment in updated["compartments"]:
        shelves = sorted(compartment["shelves"], key=lambda s: s["y"])
        for lower, upper in zip(shelves, shelves[1:]):
            gap = upper["y"] - (lower["y"] + lower["thickness"])
            if gap < min_shelf_gap and (lower["id"] in new_shelves or upper["id"] in new_shelves):
                return (f"Shelves {lower['id']} (y {lower['y']}) and {upper['id']} (y {upper['y']}) in "
                        f"{compartment['id']} leave only {gap} mm between them. Keep at least {min_shelf_gap} mm "
                        "of clear space between shelves: spread new shelves evenly inside a freeY gap (in mm).")
    return None


def _history(messages: list[dict]) -> list[dict]:
    return [{"role": m["role"], "content": m["text"]} for m in messages[-HISTORY_WINDOW:]]


def _tool_message(call_id: str, content: dict) -> dict:
    return {"role": "tool", "tool_call_id": call_id, "content": json.dumps(content, default=str)}


def _build_proposal(args: ProposeArgs, ops: list[dict], revision: int, base_hash: str, key: bytes) -> dict:
    proposal_id = f"prp_{secrets.token_hex(8)}"
    return {
        "proposalId": proposal_id,
        "baseRevision": revision,
        "baseHash": base_hash,
        "ops": ops,
        "summary": args.summary,
        "changes": [change.model_dump() for change in args.changes],
        "signature": signing.sign(key, proposal_id=proposal_id, ops=ops, base_revision=revision, base_hash=base_hash),
    }


def run_turn(*, client: Any, model: str, messages: list[dict], design: dict, revision: int,
             catalog: dict, signing_key: bytes, language: Language = "he", units: Units = "cm",
             min_shelf_gap: int = DEFAULT_MIN_SHELF_GAP_MM) -> TurnResult:
    """`design` must already be canonical (parsed and validated). The reply is in the language of the
    latest customer message; `language` (the chat's choice) is the fallback when it has no letters."""
    language = reply_language(messages, language)
    conversation: list[dict] = [{"role": "system", "content": build_system_prompt(design, catalog, language, units, min_shelf_gap)}, *_history(messages)]
    base_hash = signing.design_hash(design)

    for _ in range(MAX_REPAIRS + 1):
        try:
            response = client.chat.completions.create(
                model=model, messages=conversation, tools=TOOLS, tool_choice="required", parallel_tool_calls=False,
                max_completion_tokens=MAX_COMPLETION_TOKENS,
            )
        except Exception as error:  # provider/network errors: never leak details to the customer
            raise AgentUnavailable() from error
        message = response.choices[0].message
        calls = message.tool_calls or []
        if not calls:
            # Every turn must be classified through a tool; free text is never shown to the customer.
            return TurnResult(reply=OFF_TOPIC_REPLY[language])

        conversation.append({
            "role": "assistant",
            "content": message.content,
            "tool_calls": [
                {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
                for c in calls
            ],
        })
        call, extra = calls[0], calls[1:]
        for ignored in extra:
            conversation.append(_tool_message(ignored.id, {"error": "Only one tool call per turn is processed."}))

        try:
            arguments = json.loads(call.function.arguments or "{}")
            if call.function.name == DECLINE:
                return TurnResult(reply=OFF_TOPIC_REPLY[language])
            if call.function.name == CLARIFY:
                result = TurnResult(reply=ClarifyArgs.model_validate(arguments).question)
            elif call.function.name == ANSWER:
                result = TurnResult(reply=AnswerArgs.model_validate(arguments).answer)
            elif call.function.name == OFFER:
                result = TurnResult(reply=OfferArgs.model_validate(arguments).reply, offer_profile=True)
            elif call.function.name == PROPOSE:
                args = ProposeArgs.model_validate(arguments)
                ops = fill_ids(args.ops)
                updated = apply_ops(design, ops, catalog)  # dry run on the engine's private copy
                problem = proposal_problem(ops, updated, min_shelf_gap)
                if problem:
                    conversation.append(_tool_message(call.id, {"error": problem, "hint": "Fix the ops and call propose_changes again."}))
                    continue
                result = TurnResult(reply=args.reply, proposal=_build_proposal(args, ops, revision, base_hash, signing_key))
            else:
                raise ValueError(f"unknown tool {call.function.name!r}")
            texts = [args.reply, args.summary, *(f"{c.title} {c.detail}" for c in args.changes)] if result.proposal else [result.reply]
            if any(off_language(text, language) for text in texts):
                # e.g. a Russian reply to a Russian message: ask again in the response language.
                conversation.append(_tool_message(call.id, {"error": REMINDER[language]}))
                continue
        except DomainError as error:
            conversation.append(_tool_message(call.id, {"error": error.to_dict(), "hint": "Fix the ops and call propose_changes again."}))
            continue
        except (ValidationError, ValueError, TypeError) as error:
            detail = error.errors(include_input=False, include_url=False) if isinstance(error, ValidationError) else str(error)
            conversation.append(_tool_message(call.id, {"error": "invalid tool arguments", "detail": detail}))
            continue
        return result

    return TurnResult(reply=FALLBACK_REPLY[language])
