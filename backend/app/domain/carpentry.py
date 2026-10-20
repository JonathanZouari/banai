"""Carpenter plan: cut list, hardware, edge banding and assembly steps derived from a design.

Pure and deterministic: `build_plan(design, catalog)` never mutates its input. The rules come
from carpentry_defaults.py and are documented prototype assumptions, not verified
construction rules; the app never claims the result is manufacturable (docs/carpentry.md).
Texts are keys plus parameters, so the PDF can be rendered in Hebrew or English.
"""

from __future__ import annotations

import math
from collections import Counter

from app.domain.carpentry_defaults import BACK_MATERIAL, CARPENTRY_DEFAULTS, HINGE_TABLE, RUNNER_LENGTHS
from app.domain.catalog import SECTIONS
from app.domain.geometry import compartment_x_ranges, interior_height, interior_width
from app.domain.schema import parse_design

MIN_PART_MM = 10  # never emit a zero or negative dimension


def material_label(appearance: dict, catalog: dict) -> str:
    """'Melamine board · White · Matte', or the customer's custom names."""
    names = []
    for field, section in SECTIONS.items():
        ref = appearance[field]
        if ref.get("custom"):
            names.append(ref["name"])
        else:
            entry = next((e for e in catalog[section] if e["id"] == ref["catalogId"]), None)
            names.append(entry["name"] if entry else ref["catalogId"])
    return " · ".join(names)


def hinge_count(door_height: int) -> int:
    return next(count for limit, count in HINGE_TABLE if door_height <= limit)


def hinge_positions(door_height: int, offset: int) -> list[int]:
    count = hinge_count(door_height)
    span = door_height - 2 * offset
    return [offset + round(span * i / (count - 1)) for i in range(count)]


def runner_length(depth: int, back_gap: int) -> int:
    fitting = [length for length in RUNNER_LENGTHS if length <= depth - back_gap]
    if fitting:
        return fitting[-1]
    return max(MIN_PART_MM, (depth - back_gap) // 50 * 50)


def _part(kind: str, qty: int, length: int, width: int, thickness: int, material: str, **params) -> dict:
    return {
        "kind": kind, "qty": qty, "length": max(MIN_PART_MM, int(length)), "width": max(MIN_PART_MM, int(width)),
        "thickness": thickness, "material": material, "params": params,
    }


def _door_span(design: dict, ranges: list[tuple[int, int]], first: int, last: int) -> tuple[int, int]:
    """Exterior x range a full-overlay door covers: outer edges or the middle of partitions."""
    panel = design["carcass"]["panelThickness"]
    partitions = design["partitions"]
    left = 0 if first == 0 else panel + ranges[first - 1][1] + partitions[first - 1]["thickness"] / 2
    right = (design["dimensions"]["width"] if last == len(ranges) - 1
             else panel + ranges[last][1] + partitions[last]["thickness"] / 2)
    return int(left), int(right)


def build_plan(design: dict, catalog: dict) -> dict:  # noqa: C901, PLR0915 - one linear recipe
    d = parse_design(design)  # canonical private copy
    c = CARPENTRY_DEFAULTS
    width, height, depth = (d["dimensions"][k] for k in ("width", "height", "depth"))
    panel = d["carcass"]["panelThickness"]
    iw, ih = interior_width(d), interior_height(d)
    ranges = compartment_x_ranges(d)
    body = material_label(d["carcass"]["appearance"], catalog)
    door_default = material_label(d["doors"]["appearance"], catalog)
    item_material = lambda item: material_label(item["appearance"], catalog) if item.get("appearance") else body  # noqa: E731

    parts: list[dict] = [
        _part("side", 2, height, depth, panel, body),
        _part("top_bottom", 2, iw, depth, panel, body),
        _part("back", 1, height, width, c["backThickness"], BACK_MATERIAL),
    ]
    for index, partition in enumerate(d["partitions"]):
        parts.append(_part("partition", 1, ih, depth, partition["thickness"], body,
                           x=panel + ranges[index][1], between=[index + 1, index + 2]))

    shelf_depth = depth - c["backThickness"] - c["shelfSetback"]
    runner = runner_length(depth, c["drawerRunnerBackGap"])
    hardware: Counter = Counter()
    banding = 2 * height + 2 * iw + len(d["partitions"]) * ih
    rails, drawers_total, shelves_total = [], 0, 0

    for index, (compartment, (x0, _x1)) in enumerate(zip(d["compartments"], ranges, strict=True)):
        cw, number = compartment["width"], index + 1
        groups: Counter = Counter()
        for shelf in compartment["shelves"]:
            groups[(shelf["thickness"], item_material(shelf))] += 1
        for (thickness, material), qty in sorted(groups.items()):
            heights = sorted(s["y"] for s in compartment["shelves"]
                             if s["thickness"] == thickness and item_material(s) == material)
            parts.append(_part("shelf", qty, cw, shelf_depth, thickness, material, compartment=number, y=heights))
        shelves_total += len(compartment["shelves"])
        banding += cw * len(compartment["shelves"])

        for drawer in sorted(compartment["drawers"], key=lambda item: item["y"]):
            drawers_total += 1
            front_w, front_h = cw - 2 * c["drawerFrontGap"], drawer["height"] - c["drawerFrontGap"]
            box_outer = cw - 2 * c["runnerClearance"]
            box_h = max(MIN_PART_MM, drawer["height"] - c["drawerBoxHeightReduction"])
            box_t = c["drawerBoxThickness"]
            parts += [
                _part("drawer_front", 1, front_w, front_h, panel, item_material(drawer), compartment=number, y=drawer["y"]),
                _part("drawer_side", 2, runner, box_h, box_t, body, compartment=number, y=drawer["y"]),
                _part("drawer_front_back", 2, box_outer - 2 * box_t, box_h, box_t, body, compartment=number, y=drawer["y"]),
                _part("drawer_bottom", 1, box_outer, runner, c["drawerBottomThickness"], BACK_MATERIAL,
                      compartment=number, y=drawer["y"]),
            ]
            hardware[("runner_pair", runner)] += 1
            hardware[("handle", 0)] += 1
            banding += 2 * (front_w + front_h)

        for rail in compartment["rails"]:
            rails.append({"compartment": number, "y": rail["y"], "length": cw - c["railShortening"], "x": panel + x0})
            hardware[("rail_rod", cw - c["railShortening"])] += 1
            hardware[("rail_support", 0)] += c["railSupportsPerRail"]

    hardware[("shelf_pin", 0)] += shelves_total * c["shelfPinsPerShelf"]
    doors = d["doors"]
    door_list = []
    if doors["type"] == "hinged":
        door_height = height - 2 * c["doorGap"]
        index_of = {comp["id"]: i for i, comp in enumerate(d["compartments"])}
        for door in doors["items"]:
            covered = sorted(index_of[cid] for cid in door["compartmentIds"])
            left, right = _door_span(d, ranges, covered[0], covered[-1])
            door_width = right - left - 2 * c["doorGap"]
            positions = hinge_positions(door_height, c["hingeEdgeOffset"])
            material = material_label(door["appearance"], catalog) if door.get("appearance") else door_default
            parts.append(_part("door", 1, door_height, door_width, panel, material,
                               compartments=[i + 1 for i in covered], hinge_side=door["hingeSide"], hinges=positions))
            door_list.append({"x": left + c["doorGap"], "width": door_width, "hingeSide": door["hingeSide"],
                              "hinges": positions})
            hardware[("hinge", 0)] += len(positions)
            hardware[("handle", 0)] += 1
            banding += 2 * (door_height + door_width)
    elif doors["type"] == "sliding":
        count = len(doors["items"])
        panel_width = math.ceil((width + (count - 1) * c["slidingOverlap"]) / count)
        panel_height = height - c["slidingHeightReduction"]
        parts.append(_part("sliding_door", count, panel_height, panel_width, panel, door_default))
        hardware[("sliding_track", width)] += 1
        hardware[("handle", 0)] += count
        banding += count * 2 * (panel_height + panel_width)

    joints = 4 + 2 * len(d["partitions"])
    hardware[("confirmat", 0)] += joints * c["screwsPerJoint"]
    banding_m = math.ceil(banding * (100 + c["edgeBandingWastePercent"]) / 100 / 100) / 10

    return {
        "dimensions": {"width": width, "height": height, "depth": depth},
        "panelThickness": panel,
        "interior": {"width": iw, "height": ih},
        "doorType": doors["type"],
        "materials": {"body": body, "doors": door_default},
        "compartments": [
            {"number": i + 1, "width": comp["width"], "x": panel + x0,
             "shelves": sorted(s["y"] for s in comp["shelves"]),
             "drawers": sorted([dr["y"], dr["height"]] for dr in comp["drawers"]),
             "rails": sorted(r["y"] for r in comp["rails"])}
            for i, (comp, (x0, _)) in enumerate(zip(d["compartments"], ranges, strict=True))
        ],
        "partitions": [{"x": panel + ranges[i][1], "thickness": p["thickness"]} for i, p in enumerate(d["partitions"])],
        "doors": door_list,
        "rails": rails,
        "parts": parts,
        "hardware": [{"kind": kind, "size": size, "qty": qty} for (kind, size), qty in sorted(hardware.items()) if qty],
        "edgeBandingMeters": banding_m,
        "counts": {"shelves": shelves_total, "drawers": drawers_total, "rails": len(rails),
                   "doors": len(doors["items"]), "partitions": len(d["partitions"])},
        "runnerLength": runner,
        "assumptions": dict(CARPENTRY_DEFAULTS),
    }
