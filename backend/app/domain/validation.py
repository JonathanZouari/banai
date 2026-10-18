"""Structural validation of a canonical design.

Returns every issue, in a fixed order (the order is part of the parity contract
with frontend/src/domain/validation.js):
  1. schema shape  2. unique ids  3. partition count  4. ranges
  5. width sum  6. per-compartment bounds and overlaps  7. doors  8. catalog refs
These are rendering/data-safety checks only, never manufacturing rules.
"""

from __future__ import annotations

from collections.abc import Iterator

from app.domain import errors as codes
from app.domain.catalog import catalog_ids
from app.domain.defaults import LIMITS, SHOE_TIER
from app.domain.errors import DomainError
from app.domain.geometry import interior_height, interior_width
from app.domain.schema import parse_design

# The raw readings and the governing value each one sets (the smallest known reading).
SITE_READINGS = {"widths": "niche", "heights": "ceiling"}


def validate_design(data: object, catalog: dict | None) -> list[DomainError]:
    """Validate a design. `catalog=None` skips the catalog-reference check."""
    try:
        design = parse_design(data)
    except DomainError as error:
        return [error]
    return validate_canonical(design, catalog)


def validate_canonical(design: dict, catalog: dict | None) -> list[DomainError]:
    """Rules 2-8 on a design that already passed `parse_design`."""
    issues: list[DomainError] = []
    issues += _check_unique_ids(design)
    partition_count_ok = len(design["partitions"]) == len(design["compartments"]) - 1
    if not partition_count_ok:
        issues.append(DomainError(codes.WIDTH_MISMATCH, "partitions",
                                  "there must be exactly one partition between adjacent compartments"))
    issues += _check_ranges(design)
    if partition_count_ok:
        issues += _check_width_sum(design)
    for index in range(len(design["compartments"])):
        issues += _check_compartment(design, index)
    issues += _check_doors(design)
    if catalog is not None:
        issues += _check_catalog(design, catalog)
    return issues


def _check_unique_ids(design: dict) -> list[DomainError]:
    seen: set[str] = set()
    issues = []
    for path, component_id in _iter_ids(design):
        if component_id in seen:
            issues.append(DomainError(codes.DUPLICATE_ID, path, "this id is already used"))
        seen.add(component_id)
    return issues


def _iter_ids(design: dict) -> Iterator[tuple[str, str]]:
    for ci, compartment in enumerate(design["compartments"]):
        yield f"compartments[{ci}].id", compartment["id"]
        for kind in ("shelves", "drawers", "rails"):
            for ii, item in enumerate(compartment[kind]):
                yield f"compartments[{ci}].{kind}[{ii}].id", item["id"]
        for ii, item in enumerate(compartment["inserts"]):
            yield f"compartments[{ci}].inserts[{ii}].id", item["id"]
    for pi, partition in enumerate(design["partitions"]):
        yield f"partitions[{pi}].id", partition["id"]
    for di, door in enumerate(design["doors"]["items"]):
        yield f"doors.items[{di}].id", door["id"]


def range_issue(value: int, limit: str, path: str) -> DomainError | None:
    low, high = LIMITS[limit]
    if low <= value <= high:
        return None
    return DomainError(codes.OUT_OF_RANGE, path, f"{value} is outside [{low}, {high}]")


def _check_ranges(design: dict) -> list[DomainError]:
    checks = [
        (design["dimensions"]["width"], "width", "dimensions.width"),
        (design["dimensions"]["height"], "height", "dimensions.height"),
        (design["dimensions"]["depth"], "depth", "dimensions.depth"),
        (design["carcass"]["panelThickness"], "panelThickness", "carcass.panelThickness"),
        (design["carcass"]["plinthHeight"], "plinthHeight", "carcass.plinthHeight"),
        (len(design["compartments"]), "compartmentCount", "compartments"),
    ]
    if design["doors"]["type"] == "sliding":
        checks.append((len(design["doors"]["items"]), "slidingDoorCount", "doors.items"))
    for pi, partition in enumerate(design["partitions"]):
        checks.append((partition["thickness"], "partitionThickness", f"partitions[{pi}].thickness"))
    for ci, compartment in enumerate(design["compartments"]):
        checks.append((compartment["width"], "compartmentWidth", f"compartments[{ci}].width"))
    for ci, compartment in enumerate(design["compartments"]):
        for si, shelf in enumerate(compartment["shelves"]):
            checks.append((shelf["thickness"], "shelfThickness", f"compartments[{ci}].shelves[{si}].thickness"))
        for di, drawer in enumerate(compartment["drawers"]):
            checks.append((drawer["height"], "drawerHeight", f"compartments[{ci}].drawers[{di}].height"))
        for ii, item in enumerate(compartment["inserts"]):
            if item["tiers"] is not None:
                checks.append((item["tiers"], "shoeTiers", f"compartments[{ci}].inserts[{ii}].tiers"))
            if item["height"] is not None:
                checks.append((item["height"], "insertHeight", f"compartments[{ci}].inserts[{ii}].height"))
    site = design["site"] or {}
    for field in ("ceiling", "niche", "clearance"):
        if site.get(field) is not None:
            checks.append((site[field], field, f"site.{field}"))
    for readings, limit in SITE_READINGS.items():
        for i, value in enumerate(site.get(readings) or []):
            if value is not None:
                checks.append((value, limit, f"site.{readings}[{i}]"))
    issues = [issue for v, limit, path in checks if (issue := range_issue(v, limit, path))]
    for readings, single in SITE_READINGS.items():
        values = site.get(readings)
        if values is None:
            continue
        known = [v for v in values if v is not None]
        if not known:
            issues.append(DomainError(codes.SCHEMA_INVALID, f"site.{readings}", "give at least one reading or null"))
        elif site.get(single) != min(known):
            issues.append(DomainError(codes.SCHEMA_INVALID, f"site.{single}", f"{single} must be the smallest of {readings}"))
    return issues


def _check_width_sum(design: dict) -> list[DomainError]:
    used = sum(c["width"] for c in design["compartments"]) + sum(p["thickness"] for p in design["partitions"])
    available = interior_width(design)
    if used == available:
        return []
    return [DomainError(codes.WIDTH_MISMATCH, "compartments",
                        f"compartments and partitions use {used} mm but the interior is {available} mm")]


def _check_compartment(design: dict, ci: int) -> list[DomainError]:
    compartment = design["compartments"][ci]
    top = interior_height(design)
    base = f"compartments[{ci}]"
    issues = []
    spans = []  # (start, end, path) for shelves then drawers
    for kind, size_key in (("shelves", "thickness"), ("drawers", "height")):
        for ii, item in enumerate(compartment[kind]):
            start, end = item["y"], item["y"] + item[size_key]
            if start < 0 or end > top:
                issues.append(DomainError(codes.OUT_OF_BOUNDS, f"{base}.{kind}[{ii}].y",
                                          f"spans {start}..{end} outside interior 0..{top}"))
            spans.append((start, end, f"{base}.{kind}[{ii}]"))
    for ri, rail in enumerate(compartment["rails"]):
        if not 0 <= rail["y"] <= top:
            issues.append(DomainError(codes.OUT_OF_BOUNDS, f"{base}.rails[{ri}].y",
                                      f"rail at {rail['y']} outside interior 0..{top}"))
    for j, (start_j, end_j, path_j) in enumerate(spans):
        for start_i, end_i, path_i in spans[:j]:
            if start_j < end_i and start_i < end_j:
                issues.append(DomainError(codes.OVERLAP, path_j, f"overlaps {path_i}"))
                break
    for ri, rail in enumerate(compartment["rails"]):
        for start, end, path in spans:
            if start < rail["y"] < end:
                issues.append(DomainError(codes.OVERLAP, f"{base}.rails[{ri}]", f"rail is inside {path}"))
                break
    issues += _check_inserts(compartment, base, top, spans)
    return issues


# Which of y/tiers/height each insert type takes (the rest must be null).
_INSERT_FIELDS = {"shoes": ("y", "tiers"), "trousers": ("y", "height"), "pulldown": ("y",), "led": ()}


def _check_inserts(compartment: dict, base: str, top: int, spans: list) -> list[DomainError]:
    issues = []
    seen: set[str] = set()
    zones = []  # (start, end, path) of the inserts that take an interior zone
    for ii, item in enumerate(compartment["inserts"]):
        path = f"{base}.inserts[{ii}]"
        wanted = _INSERT_FIELDS[item["type"]]
        wrong = next((f for f in ("y", "tiers", "height") if (item[f] is not None) != (f in wanted)), None)
        if wrong:
            issues.append(DomainError(codes.INSERT_INVALID, f"{path}.{wrong}",
                                      f"{item['type']} inserts {'need' if wrong in wanted else 'have no'} {wrong}"))
            continue
        if item["type"] in seen:
            issues.append(DomainError(codes.INSERT_INVALID, f"{path}.type", "only one insert of each type per compartment"))
            continue
        seen.add(item["type"])
        if item["type"] in ("shoes", "trousers"):
            start = item["y"]
            end = start + (item["tiers"] * SHOE_TIER if item["type"] == "shoes" else item["height"])
            if start < 0 or end > top:
                issues.append(DomainError(codes.OUT_OF_BOUNDS, f"{path}.y", f"spans {start}..{end} outside interior 0..{top}"))
            hit = next((p for s, e, p in spans + zones if start < e and s < end), None)
            if hit:
                issues.append(DomainError(codes.OVERLAP, path, f"overlaps {hit}"))
            zones.append((start, end, path))
        elif item["type"] == "pulldown":
            if not 0 <= item["y"] <= top:
                issues.append(DomainError(codes.OUT_OF_BOUNDS, f"{path}.y", f"rail at {item['y']} outside interior 0..{top}"))
            hit = next((p for s, e, p in spans + zones if s < item["y"] < e), None)
            if hit:
                issues.append(DomainError(codes.OVERLAP, path, f"rail is inside {hit}"))
    for ri, rail in enumerate(compartment["rails"]):
        hit = next((p for s, e, p in zones if s < rail["y"] < e), None)
        if hit:
            issues.append(DomainError(codes.OVERLAP, f"{base}.rails[{ri}]", f"rail is inside {hit}"))
    return issues


def _check_doors(design: dict) -> list[DomainError]:
    doors = design["doors"]
    items = doors["items"]
    if doors["type"] == "none":
        return [DomainError(codes.DOOR_INVALID, "doors.items", "type 'none' must have no doors")] if items else []
    if not items:
        return [DomainError(codes.DOOR_INVALID, "doors.items", f"{doors['type']} doors need at least one door")]
    if doors["type"] == "sliding":
        return [
            DomainError(codes.DOOR_INVALID, f"doors.items[{i}].{field}", f"sliding doors have no {field}")
            for i, door in enumerate(items)
            for field, invalid in (("compartmentIds", bool(door["compartmentIds"])),
                                   ("hingeSide", door["hingeSide"] is not None),
                                   ("bottomShelfId", door["bottomShelfId"] is not None),
                                   ("topShelfId", door["topShelfId"] is not None))
            if invalid
        ]
    return _check_hinged(design)


def _door_extent(design: dict, door: dict, path: str, full: int) -> tuple[tuple[int, int], list[DomainError]]:
    """A door's vertical extent in doubled interior mm (centre lines of its anchors), and anchor issues."""
    bottom, top = door["bottomShelfId"], door["topShelfId"]
    if bottom is None and top is None:
        return (0, full), []
    ids_ = door["compartmentIds"]
    if len(ids_) != 1:
        return (0, full), [DomainError(codes.DOOR_INVALID, f"{path}.compartmentIds", "an anchored door covers one compartment")]
    compartment = next((c for c in design["compartments"] if c["id"] == ids_[0]), None)
    fixed = {s["id"]: s for s in compartment["shelves"] if s["fixed"]} if compartment else {}
    issues, ends = [], []
    for field, shelf_id, default in (("bottomShelfId", bottom, 0), ("topShelfId", top, full)):
        shelf = fixed.get(shelf_id) if shelf_id is not None else None
        if shelf_id is not None and shelf is None:
            issues.append(DomainError(codes.DOOR_INVALID, f"{path}.{field}", "must be a divider (fixed shelf) of its compartment"))
        ends.append(default if shelf is None else 2 * shelf["y"] + shelf["thickness"])
    if not issues and ends[0] >= ends[1]:
        issues.append(DomainError(codes.DOOR_INVALID, f"{path}.topShelfId", "must be above the bottom anchor"))
    return (ends[0], ends[1]), issues


def _check_hinged(design: dict) -> list[DomainError]:
    index_of = {c["id"]: i for i, c in enumerate(design["compartments"])}
    full = 2 * interior_height(design)
    # Per compartment, the doors covering it so far: (low, high, single, anchors), doubled interior mm.
    # Extents may not overlap, except a split pair: two single-compartment doors with the same anchors.
    covered: dict[str, list[tuple[int, int, bool, tuple]]] = {}
    issues = []
    for di, door in enumerate(design["doors"]["items"]):
        path = f"doors.items[{di}]"
        if door["hingeSide"] is None:
            issues.append(DomainError(codes.DOOR_INVALID, f"{path}.hingeSide", "hinged doors need a hinge side"))
        ids_ = door["compartmentIds"]
        anchors = (door["bottomShelfId"], door["topShelfId"])
        (low, high), anchor_issues = _door_extent(design, door, path, full)
        problem = None
        if not ids_:
            problem = "a hinged door must cover at least one compartment"
        elif any(cid not in index_of for cid in ids_):
            problem = "references an unknown compartment"
        else:
            positions = [index_of[cid] for cid in ids_]
            if positions != list(range(positions[0], positions[0] + len(positions))):
                problem = "compartments must be adjacent and ordered left to right"
            else:
                for cid in ids_:
                    clashes = [c for c in covered.get(cid, []) if c[0] < high and low < c[1]]
                    pair = len(ids_) == 1 and len(clashes) == 1 and clashes[0][2] and clashes[0][3] == anchors
                    if clashes and not pair:
                        problem = "a compartment is already covered by another door"
                        break
        if problem:
            issues.append(DomainError(codes.DOOR_INVALID, f"{path}.compartmentIds", problem))
        issues += anchor_issues
        for cid in ids_:
            covered.setdefault(cid, []).append((low, high, len(ids_) == 1, anchors))
    return issues


def _check_catalog(design: dict, catalog: dict) -> list[DomainError]:
    known = catalog_ids(catalog)
    owners = [("carcass.appearance", design["carcass"]["appearance"]),
              ("doors.appearance", design["doors"]["appearance"])]
    owners += [(f"doors.items[{i}].appearance", d["appearance"]) for i, d in enumerate(design["doors"]["items"])]
    for ci, compartment in enumerate(design["compartments"]):
        for kind in ("shelves", "drawers"):
            owners += [(f"compartments[{ci}].{kind}[{i}].appearance", item["appearance"])
                       for i, item in enumerate(compartment[kind])]
    issues = []
    for path, appearance in owners:
        if appearance is None:
            continue
        for field in ("material", "color", "finish"):
            ref = appearance[field]
            if "catalogId" in ref and ref["catalogId"] not in known[field]:
                issues.append(DomainError(codes.UNKNOWN_CATALOG_ID, f"{path}.{field}",
                                          f"unknown catalog {field}"))
    return issues
