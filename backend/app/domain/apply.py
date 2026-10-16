"""Pure application of operations: `apply_ops(design, ops, catalog) -> new design`.

Each op runs on the engine's private canonical copy (handlers edit it in place
and return it; the caller's input is never touched), and the result is re-validated in full, so callers never observe mutation
and never receive an invalid design. A batch is atomic: the whole batch is
schema-checked first, then the first failing op raises and nothing is returned.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.domain import ops as op_types
from app.domain.errors import INVALID_OP, DomainError
from app.domain.ops_interior import INTERIOR_HANDLERS
from app.domain.ops_items import ITEM_HANDLERS
from app.domain.ops_structure import STRUCTURE_HANDLERS
from app.domain.schema import StrictModel, parse_design
from app.domain.validation import validate_canonical

Handler = Callable[[dict | None, Any, str], dict]
HANDLERS: dict[type[StrictModel], Handler] = {**STRUCTURE_HANDLERS, **ITEM_HANDLERS, **INTERIOR_HANDLERS}


def apply_ops(design: dict | None, ops: object, catalog: dict | None) -> dict:
    parsed = op_types.parse_ops(ops)
    current = _checked(design, catalog) if design is not None else None
    for index, op in enumerate(parsed):
        current = _apply_op(current, op, index, catalog)
    if current is None:
        raise DomainError(INVALID_OP, "ops", "no design: the first op must be create_wardrobe")
    return current


def _apply_op(design: dict | None, op: StrictModel, index: int, catalog: dict | None) -> dict:
    path = f"ops[{index}]"
    if design is None and not isinstance(op, op_types.CreateWardrobe):
        raise DomainError(INVALID_OP, path, "no design yet: start with create_wardrobe")
    # `design` is always this call's own canonical copy (fresh from parse_design),
    # never the caller's object, so handlers may edit it in place without a deepcopy.
    return _checked(HANDLERS[type(op)](design, op, path), catalog)


def _checked(design: object, catalog: dict | None) -> dict:
    canonical = parse_design(design)
    issues = validate_canonical(canonical, catalog)
    if issues:
        raise issues[0]
    return canonical
