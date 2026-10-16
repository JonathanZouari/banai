"""Handlers for schema v2 interior ops: site, presets, inserts and door splitting.

Mirrors frontend/src/domain/opsInterior.js. Integer arithmetic only (parity with JS):
`_half_up` replaces Python's banker's `round()` so both engines round the same way.
"""

from __future__ import annotations

import copy

from app.domain import ids
from app.domain import ops as op_types
from app.domain.defaults import DEFAULT_SHOE_TIERS, DEFAULT_TROUSER_HEIGHT, PULLDOWN_DROP
from app.domain.errors import INVALID_OP, DomainError
from app.domain.geometry import interior_height
from app.domain.lookup import compartment_index, find_door, find_insert, require_range

# Which optional fields each insert type takes. Everything else must be absent.
INSERT_FIELDS = {"shoes": ("y", "tiers"), "trousers": ("y", "height"), "pulldown": ("y",), "led": ()}


def _half_up(numerator: int, denominator: int) -> int:
    """numerator / denominator rounded half up, for non-negative ints (= JS Math.round)."""
    return (2 * numerator + denominator) // (2 * denominator)


def preset_items(preset: str, interior: int) -> dict:
    """Shelf, rail and drawer positions (y, ascending) of an interior preset. Prototype defaults."""
    hat = interior - 330
    shelves: list[int] = []
    rails: list[int] = []
    drawers: list[tuple[int, int]] = []
    if preset == "long":
        shelves, rails = [hat], [hat - 70]
    elif preset == "double":
        mid = _half_up(interior * 46, 100)
        shelves, rails = [mid, hat], [mid - 70, hat - 70]
    elif preset == "shelves":
        count = max(2, _half_up(interior, 360))
        shelves = [_half_up(k * interior, count) for k in range(1, count)]
    else:  # drawers: three drawers, a shelf over them, shelves above
        drawers = [(k * 230, 224) for k in range(3)]
        top = 700
        count = max(1, _half_up(interior - top, 360))
        shelves = [top] + [top + _half_up(k * (interior - top), count) for k in range(1, count)]
    return {"shelves": shelves, "rails": rails, "drawers": drawers}


def apply_preset(draft: dict, op: op_types.ApplyPreset, path: str) -> dict:
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    compartment = draft["compartments"][index]
    items = preset_items(op.preset, interior_height(draft))
    # Deterministic ids, so replaying an approved proposal gives the same design.
    tag = compartment["id"][len(ids.COMPARTMENT) + 1:][:30]
    thickness = draft["carcass"]["panelThickness"]
    compartment["shelves"] = [{"id": f"{ids.SHELF}_{tag}_{k + 1}", "y": y, "thickness": thickness, "appearance": None}
                              for k, y in enumerate(items["shelves"])]
    compartment["rails"] = [{"id": f"{ids.RAIL}_{tag}_{k + 1}", "y": y} for k, y in enumerate(items["rails"])]
    compartment["drawers"] = [{"id": f"{ids.DRAWER}_{tag}_{k + 1}", "y": y, "height": h, "appearance": None, "handle": None}
                              for k, (y, h) in enumerate(items["drawers"])]
    # Inserts that take an interior zone would clash with the new layout; lighting stays.
    compartment["inserts"] = [i for i in compartment["inserts"] if i["type"] == "led"]
    return draft


def _reject_foreign_fields(op, insert_type: str, path: str) -> None:
    for field in ("y", "tiers", "height"):
        if getattr(op, field) is not None and field not in INSERT_FIELDS[insert_type]:
            raise DomainError(INVALID_OP, f"{path}.{field}", f"a {insert_type} insert has no {field}")


def add_insert(draft: dict, op: op_types.AddInsert, path: str) -> dict:
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    _reject_foreign_fields(op, op.type, path)
    item = {"id": op.id or ids.new_id(ids.INSERT), "type": op.type, "y": None, "tiers": None, "height": None}
    if op.type == "shoes":
        item.update(y=op.y if op.y is not None else 0, tiers=op.tiers if op.tiers is not None else DEFAULT_SHOE_TIERS)
    elif op.type == "trousers":
        item.update(y=op.y if op.y is not None else 0,
                    height=op.height if op.height is not None else DEFAULT_TROUSER_HEIGHT)
    elif op.type == "pulldown":
        item["y"] = op.y if op.y is not None else interior_height(draft) - PULLDOWN_DROP
    draft["compartments"][index]["inserts"].append(item)
    return draft


def modify_insert(draft: dict, op: op_types.ModifyInsert, path: str) -> dict:
    if op.y is None and op.tiers is None and op.height is None:
        raise DomainError(INVALID_OP, path, "nothing to change")
    item = find_insert(draft, op.id, f"{path}.id")
    _reject_foreign_fields(op, item["type"], path)
    for field in ("y", "tiers", "height"):
        if getattr(op, field) is not None:
            item[field] = getattr(op, field)
    return draft


def set_site(draft: dict, op: op_types.SetSite, path: str) -> dict:
    given = {f: getattr(op, f) for f in ("ceiling", "niche") if getattr(op, f) is not None}
    if op.clear:
        if given:
            raise DomainError(INVALID_OP, path, "clear cannot be combined with new values")
        draft["site"] = None
        return draft
    if not given:
        raise DomainError(INVALID_OP, path, "give ceiling, niche or clear")
    for field, value in given.items():
        require_range(value, field, f"{path}.{field}")
    draft["site"] = {"ceiling": None, "niche": None, **(draft["site"] or {}), **given}
    return draft


def split_door(draft: dict, op: op_types.SplitDoor, path: str) -> dict:
    """One hinged door over one compartment becomes a pair: left leaf hinged left, right leaf hinged right."""
    if draft["doors"]["type"] != "hinged":
        raise DomainError(INVALID_OP, path, "only hinged doors can be split")
    door = find_door(draft, op.id, f"{path}.id")
    if len(door["compartmentIds"]) != 1:
        raise DomainError(INVALID_OP, f"{path}.id", "only a door over a single compartment can be split")
    target = door["compartmentIds"][0]
    if sum(1 for d in draft["doors"]["items"] if target in d["compartmentIds"]) > 1:
        raise DomainError(INVALID_OP, f"{path}.id", "this compartment already has two doors")
    twin = copy.deepcopy(door)
    twin.update(id=op.new_id or ids.new_id(ids.DOOR), hingeSide="right", mirror=False)
    door["hingeSide"] = "left"
    items = draft["doors"]["items"]
    items.insert(items.index(door) + 1, twin)
    return draft


INTERIOR_HANDLERS = {
    op_types.ApplyPreset: apply_preset,
    op_types.AddInsert: add_insert,
    op_types.ModifyInsert: modify_insert,
    op_types.SetSite: set_site,
    op_types.SplitDoor: split_door,
}
