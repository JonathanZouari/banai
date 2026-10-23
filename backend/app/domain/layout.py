"""Manufacturing layout derived from a canonical design (port of `layout()` in the P1 prototype).

Units are mm. Body x runs from the outer face of the left side panel, y from the floor. Hinged doors
are full overlay: an end door covers the side panel, and a door meets its neighbour at the middle of
the partition between them, with a DOOR_GAP joint. Vertically a hinged door runs from the carcass
bottom (the top of the plinth) to the carcass top. A zone door (docs/schema.md "Zones") is anchored
instead to the centre line of a divider, where it meets the zone door above or below it with the same
joint. Sliding panels run between the side panels, on a top track under the top panel and a bottom
guide over the bottom panel. Shared by the advisories and the production dossier.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.geometry import compartment_x_ranges, interior_height

DOOR_GAP = 3
SLIDE_OVERLAP = 20  # neighbouring sliding panels overlap [14]
SLIDE_TRACK_DEPTH = 100  # sliding tracks take 80-100 mm of the depth [11][15]
SLIDE_TOP_TRACK = 40  # top track under the top panel
SLIDE_BOTTOM_TRACK = 12  # bottom guide over the bottom panel
SLIDE_CLEARANCE = 4  # lift-out play between the panel and the tracks
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
    height: float  # a zone door's height can end in .5 (half a divider's thickness)
    hinge: str | None
    compartment: int | None  # index, when the door covers a single compartment
    mirror: bool
    kg: float = 0.0
    hinges: int = 0
    y0: float = 0.0  # bottom edge, above the floor
    compartments: list[int] = field(default_factory=list)  # every compartment a hinged door covers
    track: str | None = None  # sliding: "back" or "front"
    anchors: tuple[str | None, str | None] = (None, None)  # hinged: (bottomShelfId, topShelfId)


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
    legs: bool = False  # the carcass stands on adjustable legs (plinth = their height), not on a plinth board

    def floor_y(self, y: float) -> float:
        """Height above the floor of an interior y."""
        return self.plinth + self.panel + y

    def behind(self, door: DoorLayout, y: float, height: float) -> bool:
        """Whether the interior span y..y + height lies, at least partly, behind the door's extent."""
        low = self.floor_y(y)
        return low < door.y0 + door.height and door.y0 < low + height


def layout(design: dict) -> Layout:
    dims, carcass, doors = design["dimensions"], design["carcass"], design["doors"]
    width, height, depth = dims["width"], dims["height"], dims["depth"]
    panel, plinth = carcass["panelThickness"], carcass["plinthHeight"]
    sliding = doors["type"] == "sliding"
    ranges = [(panel + a, panel + b) for a, b in compartment_x_ranges(design)]
    shelf_depth = depth - SLIDE_TRACK_DEPTH - 10 if sliding else depth - 25
    out = Layout(width, height, depth, panel, plinth, interior_height(design), shelf_depth, sliding, ranges)
    out.legs = carcass.get("base") == "legs"
    if doors["type"] == "hinged":
        out.doors = _hinged(design, out)
    elif sliding:
        out.doors = _sliding(design, out)
    for door in out.doors:
        door.kg = door.width * door.height / 1e6 * (BOARD_KG_M2 + (MIRROR_KG_M2 if door.mirror else 0))
        door.hinges = hinges_for(door.height, door.kg) if door.hinge else 0
    return out


def _sliding(design: dict, lay: Layout) -> list[DoorLayout]:
    items, panel = design["doors"]["items"], lay.panel
    count = len(items)
    panel_width = (lay.width - 2 * panel + (count - 1) * SLIDE_OVERLAP) / count
    y0 = lay.plinth + panel + SLIDE_BOTTOM_TRACK
    panel_height = lay.height - panel - SLIDE_TOP_TRACK - y0 - SLIDE_CLEARANCE
    result = []
    for i, d in enumerate(items):
        # Alternate tracks: with three panels the middle one runs in front of the outer two.
        track = ("front" if i == 1 else "back") if count == 3 else ("back" if i % 2 == 0 else "front")
        result.append(DoorLayout(d["id"], panel + i * (panel_width - SLIDE_OVERLAP), panel_width, panel_height, None,
                                 None, d["mirror"], y0=y0, track=track))
    return result


def _edge(lay: Layout, compartment: dict, shelf_id: str | None, default: float) -> float:
    """Height above the floor of an anchor's centre line; `default` (a carcass edge) without an anchor."""
    shelf = next((s for s in compartment["shelves"] if s["id"] == shelf_id), None) if shelf_id else None
    return default if shelf is None else lay.plinth + lay.panel + shelf["y"] + shelf["thickness"] / 2


def _hinged(design: dict, lay: Layout) -> list[DoorLayout]:
    items, partitions, comps = design["doors"]["items"], design["partitions"], design["compartments"]
    ranges = lay.ranges
    index_of = {c["id"]: i for i, c in enumerate(comps)}
    last_index = len(ranges) - 1
    result = []
    for door in items:
        covered = [index_of[c] for c in door["compartmentIds"]]
        first, last = covered[0], covered[-1]
        left = 0 if first == 0 else ranges[first][0] - partitions[first - 1]["thickness"] / 2
        right = design["dimensions"]["width"] if last == last_index else ranges[last][1] + partitions[last]["thickness"] / 2
        anchors = (door["bottomShelfId"], door["topShelfId"])
        single = len(covered) == 1
        if single:
            # A split pair: two doors over the same compartment with the same anchors. In item order, the
            # first leaf is the left one.
            leaves = [d for d in items
                      if d["compartmentIds"] == door["compartmentIds"] and (d["bottomShelfId"], d["topShelfId"]) == anchors]
            if len(leaves) == 2:
                middle = (left + right) / 2
                left, right = (left, middle) if leaves[0] is door else (middle, right)
        # Anchors are dividers of the door's one compartment (validation), so `first` is that compartment.
        bottom = _edge(lay, comps[first], anchors[0], lay.plinth)
        top = _edge(lay, comps[first], anchors[1], lay.height)
        result.append(DoorLayout(door["id"], left + DOOR_GAP / 2, right - left - DOOR_GAP, top - bottom - DOOR_GAP,
                                 door["hingeSide"], first if single else None, door["mirror"], y0=bottom + DOOR_GAP / 2,
                                 compartments=covered, anchors=anchors))
    return result
