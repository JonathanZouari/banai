"""Structural validation of a canonical design.

Returns every issue, in a fixed order (the order is part of the parity contract
with frontend/src/domain/validation.js):
  1. schema shape  2. unique ids  3. partition count  4. ranges
  5. width sum  6. per-compartment bounds and overlaps  7. doors (then door-shelf bounds and overlaps)
  8. catalog refs
These are rendering/data-safety checks only, never manufacturing rules.
"""

from __future__ import annotations

from collections.abc import Iterator

from app.domain import errors as codes
from app.domain.catalog import catalog_ids
from app.domain.defaults import DOOR_SHELF_THICKNESS, LIMITS
from app.domain.errors import DomainError
from app.domain.geometry import interior_height, interior_width
from app.domain.schema import parse_design


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
    for pi, partition in enumerate(design["partitions"]):
        yield f"partitions[{pi}].id", partition["id"]
    for di, door in enumerate(design["doors"]["items"]):
        yield f"doors.items[{di}].id", door["id"]
        for si, shelf in enumerate(door["shelves"]):
            yield f"doors.items[{di}].shelves[{si}].id", shelf["id"]


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
    for di, door in enumerate(design["doors"]["items"]):
        for si, shelf in enumerate(door["shelves"]):
            checks.append((shelf["depth"], "doorShelfDepth", f"doors.items[{di}].shelves[{si}].depth"))
    return [issue for v, limit, path in checks if (issue := range_issue(v, limit, path))]


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
                                   ("shelves", bool(door["shelves"])))
            if invalid
        ]
    return _check_hinged(design) + _check_door_shelves(design)


def _check_door_shelves(design: dict) -> list[DomainError]:
    """Door shelves stay within the interior height and don't overlap on the same door."""
    top = interior_height(design)
    issues = []
    for di, door in enumerate(design["doors"]["items"]):
        spans = []
        for si, shelf in enumerate(door["shelves"]):
            path = f"doors.items[{di}].shelves[{si}]"
            start, end = shelf["y"], shelf["y"] + DOOR_SHELF_THICKNESS
            if start < 0 or end > top:
                issues.append(DomainError(codes.OUT_OF_BOUNDS, f"{path}.y",
                                          f"spans {start}..{end} outside interior 0..{top}"))
            hit = next((other for s, e, other in spans if start < e and s < end), None)
            if hit:
                issues.append(DomainError(codes.OVERLAP, path, f"overlaps {hit}"))
            spans.append((start, end, path))
    return issues


def _check_hinged(design: dict) -> list[DomainError]:
    index_of = {c["id"]: i for i, c in enumerate(design["compartments"])}
    covered: set[str] = set()
    issues = []
    for di, door in enumerate(design["doors"]["items"]):
        path = f"doors.items[{di}]"
        if door["hingeSide"] is None:
            issues.append(DomainError(codes.DOOR_INVALID, f"{path}.hingeSide", "hinged doors need a hinge side"))
        ids_ = door["compartmentIds"]
        problem = None
        if not ids_:
            problem = "a hinged door must cover at least one compartment"
        elif any(cid not in index_of for cid in ids_):
            problem = "references an unknown compartment"
        else:
            positions = [index_of[cid] for cid in ids_]
            if positions != list(range(positions[0], positions[0] + len(positions))):
                problem = "compartments must be adjacent and ordered left to right"
            elif covered.intersection(ids_):
                problem = "a compartment is already covered by another door"
        if problem:
            issues.append(DomainError(codes.DOOR_INVALID, f"{path}.compartmentIds", problem))
        covered.update(ids_)
    return issues


def _check_catalog(design: dict, catalog: dict) -> list[DomainError]:
    known = catalog_ids(catalog)
    owners = [("carcass.appearance", design["carcass"]["appearance"]),
              ("doors.appearance", design["doors"]["appearance"])]
    owners += [(f"doors.items[{i}].appearance", d["appearance"]) for i, d in enumerate(design["doors"]["items"])]
    owners += [(f"doors.items[{i}].shelves[{si}].appearance", s["appearance"])
               for i, d in enumerate(design["doors"]["items"]) for si, s in enumerate(d["shelves"])]
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
