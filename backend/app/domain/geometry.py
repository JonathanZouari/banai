"""Derived geometry. X/Y positions are never stored; they derive from the state.

Interior coordinates: x = 0 at the inner face of the left side panel,
y = 0 at the top face of the bottom panel.
"""


def interior_width(design: dict) -> int:
    return design["dimensions"]["width"] - 2 * design["carcass"]["panelThickness"]


def interior_height(design: dict) -> int:
    carcass = design["carcass"]
    # .get: geometry also runs on hand-built v1 dicts (no plinth key) before parse_design upgrades them.
    return design["dimensions"]["height"] - 2 * carcass["panelThickness"] - carcass.get("plinthHeight", 0)


def partition_left_edge(design: dict, index: int) -> int:
    """Interior x of the left face of partitions[index]."""
    widths = sum(c["width"] for c in design["compartments"][: index + 1])
    thicknesses = sum(p["thickness"] for p in design["partitions"][:index])
    return widths + thicknesses


def compartment_x_ranges(design: dict) -> list[tuple[int, int]]:
    ranges, x = [], 0
    for index, compartment in enumerate(design["compartments"]):
        ranges.append((x, x + compartment["width"]))
        x += compartment["width"]
        if index < len(design["partitions"]):
            x += design["partitions"][index]["thickness"]
    return ranges
