"""Plain-language description of each op, built by the server from the validated ops (never taken from
the model's text), so the proposal card shows exactly what Confirm would do."""

from __future__ import annotations

from collections.abc import Callable

from app.domain.lookup import locate


def cm(mm: int) -> str:
    return f"{mm / 10:g} cm"


def _where(design: dict, component_id: str | None) -> str:
    found = locate(design, component_id) if component_id else None
    if not found:
        return "a new component"
    kind, index, _ = found
    if kind == "compartment":
        return f"compartment {index + 1}"
    if kind == "partition":
        return f"partition {index + 1}"
    if kind == "door":
        return f"door {index + 1}"
    singular = {"shelves": "shelf", "drawers": "drawer", "rails": "rail"}[kind]
    return f"{singular} in compartment {index + 1}"


def _appearance(op: dict) -> str:
    parts = []
    for field in ("material", "color", "finish"):
        ref = op.get(field)
        if ref:
            parts.append(ref.get("name") if ref.get("custom") else str(ref.get("catalogId", "")).replace("_", " "))
    return ", ".join(parts) if parts else "no change"


def _pairs(op: dict, keys: tuple[str, ...]) -> str:
    return ", ".join(f"{key} {cm(op[key])}" for key in keys if key in op)


def describe_op(op: dict, design: dict) -> dict:
    """`design` is the state *before* this op."""
    name = op["op"]
    cid = op.get("compartmentId")
    if name == "create_wardrobe":
        return {"title": "New wardrobe", "detail": f"{cm(op['width'])} wide, {cm(op['height'])} tall, {cm(op['depth'])} deep, {op['compartmentCount']} compartments. Replaces the current design."}
    if name == "update_dimensions":
        return {"title": "Change size", "detail": _pairs(op, ("width", "height", "depth"))}
    if name == "configure_doors":
        kind = op["type"]
        if kind == "sliding":
            return {"title": "Sliding doors", "detail": f"{op.get('count', 2)} sliding panels."}
        if kind == "none":
            return {"title": "Remove doors", "detail": "No doors."}
        count = len(op["doors"]) if op.get("doors") else len(design["compartments"])
        return {"title": "Hinged doors", "detail": f"{count} hinged {'door' if count == 1 else 'doors'}."}
    if name == "add_compartment":
        return {"title": "Add compartment", "detail": f"At position {op['position'] + 1}, {cm(op['width'])} wide."}
    if name == "modify_compartment":
        return {"title": "Resize compartment", "detail": f"{_where(design, op['compartmentId'])} to {cm(op['width'])} wide."}
    if name == "add_partition":
        return {"title": "Add partition", "detail": f"In {_where(design, cid)}, {cm(op['offset'])} from its left edge."}
    if name == "modify_partition":
        return {"title": "Change partition", "detail": f"{_where(design, op['partitionId'])}: {_pairs(op, ('position', 'thickness'))}."}
    if name == "add_shelf":
        return {"title": "Add shelf", "detail": f"In {_where(design, cid)}, {cm(op['y'])} from the bottom."}
    if name == "add_drawer":
        return {"title": "Add drawer", "detail": f"In {_where(design, cid)}, {cm(op['height'])} tall, {cm(op['y'])} from the bottom."}
    if name == "add_rail":
        return {"title": "Add hanging rail", "detail": f"In {_where(design, cid)}, {cm(op['y'])} from the bottom."}
    if name in ("modify_shelf", "modify_drawer", "modify_rail"):
        return {"title": f"Change {name.split('_')[1]}", "detail": f"{_where(design, op['id'])}: {_pairs(op, ('y', 'height', 'thickness'))}."}
    if name == "set_material":
        target = op["target"]
        label = "the carcass" if target == "carcass" else "the doors" if target == "doors" else _where(design, target)
        return {"title": "Change appearance", "detail": f"{label}: {'reset to inherited' if op.get('clear') else _appearance(op)}."}
    if name == "remove_component":
        return {"title": "Remove", "detail": f"{_where(design, op['id'])}."}
    return {"title": name.replace("_", " ").capitalize(), "detail": ""}


def describe_ops(ops: list[dict], design: dict, apply: Callable[[dict, list], dict]) -> list[dict]:
    """Describe a batch, stepping the design forward so each op is described against its own base."""
    changes, current = [], design
    for op in ops:
        changes.append(describe_op(op, current))
        current = apply(current, [op])
    return changes
