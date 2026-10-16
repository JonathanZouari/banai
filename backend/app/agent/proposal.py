"""Turn raw tool-call ops into a validated, id-complete batch.

Ids the model left out are generated *before* signing, so replaying an approved proposal on the same
design is deterministic. Ops are applied one at a time on a private copy (the committed design is
never touched) so id counts can depend on the state the earlier ops produce.
"""

from __future__ import annotations

from app.domain import ids
from app.domain.apply import apply_ops
from app.domain.errors import INVALID_OP, DomainError
from app.domain.ops import parse_ops

_ITEM_ID_FIELDS = {
    "add_shelf": (("id", ids.SHELF),),
    "add_drawer": (("id", ids.DRAWER),),
    "add_rail": (("id", ids.RAIL),),
    "add_compartment": (("id", ids.COMPARTMENT), ("partitionId", ids.PARTITION)),
    "add_partition": (("id", ids.PARTITION), ("newCompartmentId", ids.COMPARTMENT)),
}


def _drop_nulls(op: dict) -> dict:
    return {key: value for key, value in op.items() if value is not None}


def _fill_one(op: dict, design: dict | None) -> dict:
    op = _drop_nulls(op)
    name = op.get("op")
    for field, prefix in _ITEM_ID_FIELDS.get(name, ()):
        op.setdefault(field, ids.new_id(prefix))
    if name == "create_wardrobe" and isinstance(op.get("compartmentCount"), int):
        count = op["compartmentCount"]
        if 1 <= count <= 20:
            op.setdefault("compartmentIds", [ids.new_id(ids.COMPARTMENT) for _ in range(count)])
            op.setdefault("partitionIds", [ids.new_id(ids.PARTITION) for _ in range(count - 1)])
    if name == "configure_doors":
        op = _fill_door_ids(op, design)
    return op


def _fill_door_ids(op: dict, design: dict | None) -> dict:
    doors = op.get("doors")
    if isinstance(doors, list):
        op["doors"] = [{**_drop_nulls(d), **({} if d.get("id") else {"id": ids.new_id(ids.DOOR)})}
                       if isinstance(d, dict) else d for d in doors]
    elif op.get("type") == "sliding" and "ids" not in op:
        count = op.get("count", 2)
        if isinstance(count, int) and 1 <= count <= 6:
            op["ids"] = [ids.new_id(ids.DOOR) for _ in range(count)]
    elif op.get("type") == "hinged" and "ids" not in op and design is not None:
        op["ids"] = [ids.new_id(ids.DOOR) for _ in design["compartments"]]
    return op


def complete_and_validate(design: dict, raw_ops: list[dict], catalog: dict) -> tuple[list[dict], dict]:
    """Return (ops with every id filled in, resulting design). Raises DomainError on any invalid op."""
    parse_ops(raw_ops)  # whole-batch schema check first (also caps the batch size)
    filled: list[dict] = []
    current = design
    for index, raw in enumerate(raw_ops):
        op = _fill_one(raw, current)
        try:
            current = apply_ops(current, [op], catalog)
        except DomainError as error:
            raise DomainError(error.code, error.path.replace("ops[0]", f"ops[{index}]", 1), error.message) from None
        filled.append(op)
    if not filled:
        raise DomainError(INVALID_OP, "ops", "no changes proposed")
    return filled, current
