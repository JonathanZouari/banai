"""Handlers for schema v2 interior ops: site, presets, inserts and door splitting.

Mirrors frontend/src/domain/opsInterior.js. Integer arithmetic only (parity with JS):
`_half_up` replaces Python's banker's `round()` so both engines round the same way.
"""

from __future__ import annotations

import copy

from app.domain import ids
from app.domain import ops as op_types
from app.domain.defaults import DEFAULT_SHOE_TIERS, DEFAULT_TROUSER_HEIGHT, OBSTACLE_LIMITS, PULLDOWN_DROP
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
    if op.zone is not None:
        return _apply_zone_preset(draft, compartment, op, path)
    if dividers(compartment):
        raise DomainError(INVALID_OP, f"{path}.zone", "this compartment has zones: give a zone")
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


def _apply_zone_preset(draft: dict, compartment: dict, op: op_types.ApplyPreset, path: str) -> dict:
    """Rebuild one zone: its regular items are replaced by the preset for the zone's height, clipped to fit."""
    _require_zone(compartment, op.zone, path)
    low, high = zone_usable(draft, compartment, op.zone)
    inside = lambda y: y is not None and low <= y < high  # noqa: E731
    thickness = draft["carcass"]["panelThickness"]
    height = high - low
    items = preset_items(op.preset, height)
    tag = f"{compartment['id'][len(ids.COMPARTMENT) + 1:][:30]}_z{op.zone}"
    shelves = [y for y in items["shelves"] if 0 <= y and y + thickness <= height]
    rails = [y for y in items["rails"] if 0 <= y <= height]
    drawers = [(y, h) for y, h in items["drawers"] if 0 <= y and y + h <= height]
    compartment["shelves"] = [s for s in compartment["shelves"] if s["fixed"] or not inside(s["y"])] + [
        {"id": f"{ids.SHELF}_{tag}_{k + 1}", "y": low + y, "thickness": thickness, "appearance": None, "fixed": False}
        for k, y in enumerate(shelves)]
    compartment["rails"] = [r for r in compartment["rails"] if not inside(r["y"])] + [
        {"id": f"{ids.RAIL}_{tag}_{k + 1}", "y": low + y} for k, y in enumerate(rails)]
    compartment["drawers"] = [d for d in compartment["drawers"] if not inside(d["y"])] + [
        {"id": f"{ids.DRAWER}_{tag}_{k + 1}", "y": low + y, "height": h, "appearance": None, "handle": None}
        for k, (y, h) in enumerate(drawers)]
    compartment["inserts"] = [i for i in compartment["inserts"] if i["type"] == "led" or not inside(i["y"])]
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


# The raw readings and the governing value each one sets: the smallest known reading [research 96][11].
SITE_READINGS = {"widths": "niche", "heights": "ceiling"}
SITE_FIELDS = ("ceiling", "niche", "heights", "widths", "clearance", "obstacles")


def set_site(draft: dict, op: op_types.SetSite, path: str) -> dict:
    given = {f: getattr(op, f) for f in SITE_FIELDS if getattr(op, f) is not None}
    unset = list(dict.fromkeys(op.unset))
    if op.clear:
        if given or unset:
            raise DomainError(INVALID_OP, path, "clear cannot be combined with new values")
        draft["site"] = None
        return draft
    if not given and not unset:
        raise DomainError(INVALID_OP, path, "give a measurement, unset or clear")
    for readings, single in SITE_READINGS.items():
        if readings in given and single in given:
            raise DomainError(INVALID_OP, path, f"{single} is the smallest of {readings}: give one of them")
    if set(given) & set(unset):
        raise DomainError(INVALID_OP, path, "a field cannot be set and unset together")
    for field, value in given.items():
        if field in SITE_READINGS:
            for i, reading in enumerate(value):
                if reading is not None:
                    require_range(reading, SITE_READINGS[field], f"{path}.{field}[{i}]")
        elif field == "obstacles":
            for i, item in enumerate(value):
                for key, limit in OBSTACLE_LIMITS.items():
                    require_range(getattr(item, key), limit, f"{path}.obstacles[{i}].{key}")
        else:
            require_range(value, field, f"{path}.{field}")
    site = {f: None for f in SITE_FIELDS} | (draft["site"] or {})
    singles = {single: readings for readings, single in SITE_READINGS.items()}
    for field in unset:
        site[field] = None
        if field in singles:  # no niche means no niche readings either
            site[singles[field]] = None
    for field, value in given.items():
        if field in SITE_READINGS:
            known = [v for v in value if v is not None]
            site[field] = list(value) if known else None
            site[SITE_READINGS[field]] = min(known) if known else None
        elif field == "obstacles":  # the list is replaced; an empty one clears it
            site[field] = [item.model_dump() for item in value] or None
        else:
            site[field] = value
            if field in singles:  # one measurement replaces the three readings
                site[singles[field]] = None
    draft["site"] = site if any(v is not None for v in site.values()) else None
    return draft


def split_door(draft: dict, op: op_types.SplitDoor, path: str) -> dict:
    """One hinged door over one compartment becomes a pair: left leaf hinged left, right leaf hinged right."""
    if draft["doors"]["type"] != "hinged":
        raise DomainError(INVALID_OP, path, "only hinged doors can be split")
    door = find_door(draft, op.id, f"{path}.id")
    if len(door["compartmentIds"]) != 1:
        raise DomainError(INVALID_OP, f"{path}.id", "only a door over a single compartment can be split")
    anchors = (door["bottomShelfId"], door["topShelfId"])
    if sum(1 for d in draft["doors"]["items"]
           if d["compartmentIds"] == door["compartmentIds"] and (d["bottomShelfId"], d["topShelfId"]) == anchors) > 1:
        raise DomainError(INVALID_OP, f"{path}.id", "this compartment already has two doors")
    twin = copy.deepcopy(door)
    twin.update(id=op.new_id or ids.new_id(ids.DOOR), hingeSide="right", mirror=False)
    door["hingeSide"] = "left"
    items = draft["doors"]["items"]
    items.insert(items.index(door) + 1, twin)
    return draft


# ---- zones (docs/schema.md "Zones") ----
ZONE_SNAP = 60  # mm: an existing shelf this close to a divider's target centre becomes the divider


def dividers(compartment: dict) -> list[dict]:
    """The compartment's fixed shelves, bottom-up (ties keep list order)."""
    return sorted((s for s in compartment["shelves"] if s["fixed"]), key=lambda s: s["y"])


def zone_anchors(compartment: dict, zone: int) -> tuple[str | None, str | None]:
    fixed = dividers(compartment)
    return (fixed[zone - 2]["id"] if zone >= 2 else None, fixed[zone - 1]["id"] if zone <= len(fixed) else None)


def zone_usable(draft: dict, compartment: dict, zone: int) -> tuple[int, int]:
    """Interior y range inside zone `zone` (1-based): between the dividers' faces."""
    fixed = dividers(compartment)
    low = 0 if zone == 1 else fixed[zone - 2]["y"] + fixed[zone - 2]["thickness"]
    high = interior_height(draft) if zone == len(fixed) + 1 else fixed[zone - 1]["y"]
    return low, high


def _require_zone(compartment: dict, zone: int, path: str) -> None:
    if not 1 <= zone <= len(dividers(compartment)) + 1:
        raise DomainError(INVALID_OP, f"{path}.zone", "there is no such zone in this compartment")


def _own_doors(draft: dict, compartment_id: str, path: str) -> list[dict]:
    """Doors over this compartment alone. A door that also spans neighbours blocks zone edits."""
    items = draft["doors"]["items"]
    if any(compartment_id in d["compartmentIds"] and len(d["compartmentIds"]) > 1 for d in items):
        raise DomainError(INVALID_OP, f"{path}.compartmentId", "a door spans this compartment and its neighbours")
    return [d for d in items if d["compartmentIds"] == [compartment_id]]


def _free_id(draft: dict, base: str) -> str:
    """`base`, or `base_2`, `base_3`... when taken (deterministic in both engines)."""
    taken = {s["id"] for c in draft["compartments"] for s in c["shelves"]} | {d["id"] for d in draft["doors"]["items"]}
    if base not in taken:
        return base
    n = 2
    while f"{base}_{n}" in taken:
        n += 1
    return f"{base}_{n}"


def _zone_door(door_id: str, compartment_id: str, hinge: str, anchors: tuple, template: dict | None) -> dict:
    return {"id": door_id, "compartmentIds": [compartment_id], "hingeSide": hinge,
            "appearance": template["appearance"] if template else None, "handle": template["handle"] if template else None,
            "mirror": False, "bottomShelfId": anchors[0], "topShelfId": anchors[1]}


def set_zones(draft: dict, op: op_types.SetZones, path: str) -> dict:
    require_range(op.count, "zones", f"{path}.count")
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    compartment = draft["compartments"][index]
    hinged = draft["doors"]["type"] == "hinged"
    own = _own_doors(draft, compartment["id"], path) if hinged else []
    tag = compartment["id"][len(ids.COMPARTMENT) + 1:][:30]
    interior = interior_height(draft)
    panel = draft["carcass"]["panelThickness"]
    for shelf in compartment["shelves"]:
        shelf["fixed"] = False
    chosen: list[dict] = []
    for k in range(1, op.count):
        target = _half_up(k * interior, op.count)
        near = [(abs(2 * s["y"] + s["thickness"] - 2 * target), s["y"], i, s)
                for i, s in enumerate(compartment["shelves"]) if s not in chosen]
        near = [n for n in near if n[0] <= 2 * ZONE_SNAP]
        if near:
            shelf = min(near, key=lambda n: n[:3])[3]
        else:
            shelf = {"id": _free_id(draft, f"{ids.SHELF}_{tag}_z{k}"), "y": target - panel // 2, "thickness": panel,
                     "appearance": None, "fixed": False}
            compartment["shelves"].append(shelf)
        shelf["fixed"] = True
        chosen.append(shelf)
    if own:
        template = own[0]
        items = draft["doors"]["items"]
        at = items.index(template)
        for door in own:
            items.remove(door)
        if op.count == 1:
            fresh = [_zone_door(template["id"], compartment["id"], template["hingeSide"], (None, None), template)]
        else:
            fresh = [_zone_door(f"{ids.DOOR}_{tag}_z{k}", compartment["id"], template["hingeSide"],
                                zone_anchors(compartment, k), template) for k in range(1, op.count + 1)]
        items[at:at] = fresh
    return draft


def set_zone_door(draft: dict, op: op_types.SetZoneDoor, path: str) -> dict:
    if draft["doors"]["type"] != "hinged":
        raise DomainError(INVALID_OP, path, "zone doors are hinged doors")
    index = compartment_index(draft, op.compartment_id, f"{path}.compartmentId")
    compartment = draft["compartments"][index]
    _require_zone(compartment, op.zone, path)
    if op.leaves == 2 and op.hinge_side is not None:
        raise DomainError(INVALID_OP, f"{path}.hingeSide", "a pair is hinged on both sides")
    own = _own_doors(draft, compartment["id"], path)
    anchors = zone_anchors(compartment, op.zone)
    removed = [d for d in own if (d["bottomShelfId"], d["topShelfId"]) == anchors]
    items = draft["doors"]["items"]
    if removed:
        at = items.index(removed[0])
    elif own:
        at = items.index(own[-1]) + 1
    else:
        at = len(items)
    for door in removed:
        items.remove(door)
    template = removed[0] if removed else None
    tag = compartment["id"][len(ids.COMPARTMENT) + 1:][:30]
    base = f"{ids.DOOR}_{tag}_z{op.zone}"
    fresh = []
    if op.leaves == 1:
        hinge = op.hinge_side or (template["hingeSide"] if template else None) or "left"
        fresh = [_zone_door(_free_id(draft, base), compartment["id"], hinge, anchors, template)]
    elif op.leaves == 2:
        fresh = [_zone_door(_free_id(draft, base), compartment["id"], "left", anchors, template),
                 _zone_door(_free_id(draft, f"{base}r"), compartment["id"], "right", anchors, template)]
    items[at:at] = fresh
    return draft


def set_fittings(draft: dict, op: op_types.SetFittings, path: str) -> dict:
    if op.soft_close is None and op.base is None:
        raise DomainError(INVALID_OP, path, "give softClose or base")
    if op.soft_close is not None:
        draft["fittings"] = {**draft["fittings"], "softClose": op.soft_close}
    if op.base is not None:
        draft["carcass"]["base"] = op.base
    return draft


INTERIOR_HANDLERS = {
    op_types.SetFittings: set_fittings,
    op_types.ApplyPreset: apply_preset,
    op_types.AddInsert: add_insert,
    op_types.ModifyInsert: modify_insert,
    op_types.SetSite: set_site,
    op_types.SplitDoor: split_door,
    op_types.SetZones: set_zones,
    op_types.SetZoneDoor: set_zone_door,
}
