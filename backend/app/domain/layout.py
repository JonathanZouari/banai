"""Manufacturing layout derived from a canonical design (port of `layout()` in the P1 prototype).

Units are mm. Body x runs from the outer face of the left side panel. Hinged doors are full overlay:
an end door covers the side panel, and a door meets its neighbour at the middle of the partition
between them, with a DOOR_GAP joint. Shared by the advisories and, later, the production dossier.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.geometry import compartment_x_ranges, interior_height

DOOR_GAP = 3
SLIDE_OVERLAP = 20  # neighbouring sliding panels overlap [14]
SLIDE_TRACK_DEPTH = 100  # sliding tracks take 80-100 mm of the depth [11][15]
BOARD_KG_M2 = 11.6  # melamine on 17.6 mm board [7]
MIRROR_KG_M2 = 10  # 2.5 kg/m2 per mm of glass, 4 mm mirror [17]


def hinges_for(height_mm: float, kg: float) -> int:
    """Hinge count by door height and by weight, whichever needs more (Blum/Hafele tables [3][5])."""
    by_height = next(n for limit, n in ((900, 2), (1600, 3), (2030, 4), (2490, 5), (float("inf"), 6)) if height_mm <= limit)
    by_weight = next(n for limit, n in ((6.8, 2), (13.6, 3), (20.4, 4), (27.2, 5), (float("inf"), 6)) if kg <= limit)
    return max(by_height, by_weight)


@dataclass
class DoorLayout:
    id: str
    x0: float
    width: float
    height: int
    hinge: str | None
    compartment: int | None  # index, when the door covers a single compartment
    mirror: bool
    kg: float = 0.0
    hinges: int = 0


@dataclass
class Layout:
    width: int
    height: int
    depth: int
    panel: int
    plinth: int
    interior_height: int
    shelf_depth: int
    sliding: bool
    ranges: list[tuple[int, int]]  # body x of each compartment
    doors: list[DoorLayout] = field(default_factory=list)

    def floor_y(self, y: int) -> int:
        """Height above the floor of an interior y."""
        return self.plinth + self.panel + y


def layout(design: dict) -> Layout:
    dims, carcass, doors = design["dimensions"], design["carcass"], design["doors"]
    width, height, depth = dims["width"], dims["height"], dims["depth"]
    panel, plinth = carcass["panelThickness"], carcass["plinthHeight"]
    sliding = doors["type"] == "sliding"
    ranges = [(panel + a, panel + b) for a, b in compartment_x_ranges(design)]
    shelf_depth = depth - SLIDE_TRACK_DEPTH - 10 if sliding else depth - 25
    out = Layout(width, height, depth, panel, plinth, interior_height(design), shelf_depth, sliding, ranges)
    if doors["type"] == "hinged":
        out.doors = _hinged(design, ranges, height - plinth - DOOR_GAP)
    elif sliding:
        count = len(doors["items"])
        panel_width = (width - 2 * panel + (count - 1) * SLIDE_OVERLAP) / count
        panel_height = height - plinth - 2 * panel - 4
        out.doors = [DoorLayout(d["id"], panel + i * (panel_width - SLIDE_OVERLAP), panel_width, panel_height, None, None,
                                d["mirror"]) for i, d in enumerate(doors["items"])]
    for door in out.doors:
        door.kg = door.width * door.height / 1e6 * (BOARD_KG_M2 + (MIRROR_KG_M2 if door.mirror else 0))
        door.hinges = hinges_for(door.height, door.kg) if door.hinge else 0
    return out


def _hinged(design: dict, ranges: list[tuple[int, int]], door_height: int) -> list[DoorLayout]:
    items, partitions = design["doors"]["items"], design["partitions"]
    index_of = {c["id"]: i for i, c in enumerate(design["compartments"])}
    last_index = len(ranges) - 1
    result = []
    for door in items:
        covered = [index_of[c] for c in door["compartmentIds"]]
        first, last = covered[0], covered[-1]
        left = 0 if first == 0 else ranges[first][0] - partitions[first - 1]["thickness"] / 2
        right = design["dimensions"]["width"] if last == last_index else ranges[last][1] + partitions[last]["thickness"] / 2
        single = len(covered) == 1
        if single:
            leaves = [d for d in items if d["compartmentIds"] == door["compartmentIds"]]
            if len(leaves) == 2:  # a split pair, in item order: the first leaf is the left one
                middle = (left + right) / 2
                left, right = (left, middle) if leaves[0] is door else (middle, right)
        result.append(DoorLayout(door["id"], left + DOOR_GAP / 2, right - left - DOOR_GAP, door_height, door["hingeSide"],
                                 first if single else None, door["mirror"]))
    return result
