"""Handlers for interior items (shelves, drawers, rails) and appearance ops."""

from __future__ import annotations

from app.domain import ids
from app.domain import ops as op_types
from app.domain.defaults import DEFAULT_SHELF_THICKNESS
from app.domain.errors import INVALID_OP, NOT_FOUND, DomainError
from app.domain.lookup import compartment_index, find_item, locate

APPEARANCE_FIELDS = ("material", "color", "finish")



def add_shelf(draft: dict, op: op_types.AddShelf, path: str) -> dict:
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    thickness = op.thickness if op.thickness is not None else DEFAULT_SHELF_THICKNESS
    draft["compartments"][index]["shelves"].append(
        {"id": op.id or ids.new_id(ids.SHELF), "y": op.y, "thickness": thickness, "appearance": None}
    )
    return draft


def modify_shelf(draft: dict, op: op_types.ModifyShelf, path: str) -> dict:
    _require_any(path, op.y, op.thickness)
    shelf = find_item(draft, "shelves", op.id, f"{path}.id")
    if op.y is not None:
        shelf["y"] = op.y
    if op.thickness is not None:
        shelf["thickness"] = op.thickness
    return draft


def add_drawer(draft: dict, op: op_types.AddDrawer, path: str) -> dict:
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    draft["compartments"][index]["drawers"].append(
        {"id": op.id or ids.new_id(ids.DRAWER), "y": op.y, "height": op.height, "appearance": None}
    )
    return draft


def modify_drawer(draft: dict, op: op_types.ModifyDrawer, path: str) -> dict:
    _require_any(path, op.y, op.height)
    drawer = find_item(draft, "drawers", op.id, f"{path}.id")
    if op.y is not None:
        drawer["y"] = op.y
    if op.height is not None:
        drawer["height"] = op.height
    return draft


def add_rail(draft: dict, op: op_types.AddRail, path: str) -> dict:
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    draft["compartments"][index]["rails"].append({"id": op.id or ids.new_id(ids.RAIL), "y": op.y})
    return draft


def modify_rail(draft: dict, op: op_types.ModifyRail, path: str) -> dict:
    find_item(draft, "rails", op.id, f"{path}.id")["y"] = op.y
    return draft


def set_material(draft: dict, op: op_types.SetMaterial, path: str) -> dict:
    changes = {f: getattr(op, f).model_dump(by_alias=True) for f in APPEARANCE_FIELDS if getattr(op, f) is not None}
    if not changes and not op.clear:
        raise DomainError(INVALID_OP, path, "give material, color, finish or clear")
    if op.clear and changes:
        raise DomainError(INVALID_OP, path, "clear cannot be combined with new values")

    if op.target in ("carcass", "doors"):
        if op.clear:
            raise DomainError(INVALID_OP, f"{path}.clear", "carcass and doors appearance cannot be cleared")
        owner = draft["carcass"] if op.target == "carcass" else draft["doors"]
        owner["appearance"] = {**owner["appearance"], **changes}
        return draft

    owner, inherited = _appearance_owner(draft, op.target, f"{path}.target")
    owner["appearance"] = None if op.clear else {**(owner["appearance"] or inherited), **changes}
    return draft


def _appearance_owner(draft: dict, target: str, path: str) -> tuple[dict, dict]:
    found = locate(draft, target)
    if found is None:
        raise DomainError(NOT_FOUND, path, "no component with this id")
    kind, index, item_index = found
    if kind == "door":
        return draft["doors"]["items"][index], draft["doors"]["appearance"]
    if kind in ("shelves", "drawers"):
        return draft["compartments"][index][kind][item_index], draft["carcass"]["appearance"]
    raise DomainError(INVALID_OP, path, f"{kind} has no own appearance")


def _require_any(path: str, *values) -> None:
    if all(v is None for v in values):
        raise DomainError(INVALID_OP, path, "nothing to change")


def set_handles(draft: dict, op: op_types.SetHandles, path: str) -> dict:
    _require_any(path, op.style, op.finish)
    handles = draft["doors"]["handles"]
    if op.style is not None:
        handles["style"] = op.style
    if op.finish is not None:
        handles["finish"] = op.finish
    return draft


def modify_door(draft: dict, op: op_types.ModifyDoor, path: str) -> dict:
    _require_any(path, op.front)
    door = next((d for d in draft["doors"]["items"] if d["id"] == op.id), None)
    if door is None:
        raise DomainError(NOT_FOUND, f"{path}.id", "no door with this id")
    door["front"] = op.front
    return draft


ITEM_HANDLERS = {
    op_types.AddShelf: add_shelf,
    op_types.ModifyShelf: modify_shelf,
    op_types.AddDrawer: add_drawer,
    op_types.ModifyDrawer: modify_drawer,
    op_types.AddRail: add_rail,
    op_types.ModifyRail: modify_rail,
    op_types.SetMaterial: set_material,
    op_types.SetHandles: set_handles,
    op_types.ModifyDoor: modify_door,
}
