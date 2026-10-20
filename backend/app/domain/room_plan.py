"""The room's openings against the wardrobe (ADR-037 stage 3), for advisory R27 and the dossier's floor plan.

Backend only: the viewer cuts its own openings (frontend/src/viewer/walls3d.js) and needs none of this. Plan
coordinates as in room.py (mm, x right, y down). Every region here is convex (a box, a door's quarter circle), so
an overlap is found by clipping one polygon with the other's half-planes.
"""

from __future__ import annotations

import math

from app.domain.room import corners, opening_bottom, walls

Point = tuple[float, float]

WALL_THICKNESS = 100  # mm, as the viewer draws the walls
WALKWAY = 600  # mm kept free in front of a door or a passage, to walk through it (as R21's passage)
TOUCH = 50  # mm: a wardrobe this close in front of an opening stands against it
EPS = 1.0  # mm^2: a smaller overlap is a touch, not a clash


def wall_frame(shape: dict, index: int) -> tuple[Point, Point, Point]:
    """Wall `index`: its start, the unit vector along it and the unit normal into the room."""
    wall = walls(shape)[index]
    (x0, y0), (x1, y1) = wall["start"], wall["end"]
    u = ((x1 - x0) / wall["length"], (y1 - y0) / wall["length"])
    return (x0, y0), u, (-u[1], u[0])


def _at(frame, along: float, into: float) -> Point:
    (x0, y0), u, n = frame
    return x0 + u[0] * along + n[0] * into, y0 + u[1] * along + n[1] * into


def box(shape: dict, index: int, a0: float, a1: float, b0: float, b1: float) -> list[Point]:
    """The box from `a0` to `a1` along wall `index` and from `b0` to `b1` into the room, as a plan polygon."""
    f = wall_frame(shape, index)
    return [_at(f, a0, b0), _at(f, a1, b0), _at(f, a1, b1), _at(f, a0, b1)]


def clip(poly: list[Point], normal: Point, origin: Point) -> list[Point]:
    """The part of a convex polygon where (p - origin) . normal >= 0 (one Sutherland-Hodgman step)."""
    side = [(p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1] for p in poly]
    out: list[Point] = []
    for i, p in enumerate(poly):
        j = (i + 1) % len(poly)
        if side[i] >= 0:
            out.append(p)
        if side[i] * side[j] < 0:  # a strict crossing (a vertex on the line is kept once, above)
            t = side[i] / (side[i] - side[j])
            q = poly[j]
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def area(poly: list[Point]) -> float:
    return abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))) / 2 if len(poly) > 2 else 0.0


def _clip_box(poly: list[Point], frame, a0: float, a1: float, b0: float, b1: float) -> list[Point]:
    """`poly` inside the box [a0, a1] x [b0, b1] of a wall's frame."""
    start, u, n = frame
    for normal, along, into in ((u, a0, 0), ((-u[0], -u[1]), a1, 0), (n, 0, b0), ((-n[0], -n[1]), 0, b1)):
        poly = clip(poly, normal, _at(frame, along, into))
        if not poly:
            return []
    return poly


def overlaps(poly: list[Point], shape: dict, index: int, a0: float, a1: float, b0: float, b1: float) -> bool:
    """Whether `poly` shares more than a touch with a box of wall `index`."""
    return area(_clip_box(poly, wall_frame(shape, index), a0, a1, b0, b1)) > EPS


def _distance(p: Point, poly: list[Point]) -> float:
    """From `p` to a convex polygon (0 inside it)."""
    def seg(a: Point, b: Point) -> float:
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = dx * dx + dy * dy
        t = 0.0 if length == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length))
        return math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
    edges = list(zip(poly, poly[1:] + poly[:1]))
    crosses = [(b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) for a, b in edges]
    if all(c >= 0 for c in crosses) or all(c <= 0 for c in crosses):
        return 0.0
    return min(seg(a, b) for a, b in edges)


def hinge_point(shape: dict, opening: dict) -> tuple[Point, Point]:
    """A door's hinge on the plan and the unit vector from it to the other jamb (the closed leaf)."""
    frame = wall_frame(shape, opening["wall"])
    left = opening["hinge"] == "left"  # seen from inside the room, where the wall's start is on the left
    u = frame[1]
    return _at(frame, opening["at"] if left else opening["at"] + opening["width"], 0), (u if left else (-u[0], -u[1]))


def swing_hits(shape: dict, opening: dict, poly: list[Point]) -> bool:
    """Whether a door opening into the room sweeps through `poly` (its leaf turns a quarter circle as wide as it)."""
    if opening["type"] != "door" or opening["swing"] != "in":
        return False
    hinge, along = hinge_point(shape, opening)
    _, _, n = wall_frame(shape, opening["wall"])
    part = clip(clip(poly, n, hinge), along, hinge)  # the quarter between the closed and the open leaf
    return area(part) > EPS and _distance(hinge, part) < opening["width"] - 0.5


def wardrobe_box(design: dict, into0: float = 0, into1: float | None = None) -> list[Point]:
    """The wardrobe's footprint on the plan, or (with `into0`, `into1`) a strip in front of it."""
    room, (w, d) = design["room"], (design["dimensions"]["width"], design["dimensions"]["depth"])
    return box(room["shape"], room["wall"], room["offset"], room["offset"] + w, into0, d if into1 is None else into1)


def blocked(design: dict, reach: int) -> bool:
    """Whether the wardrobe is in any opening's way (stops at the first one: the quick fix's search asks this)."""
    return next(_conflicts(design, reach), None) is not None


def conflicts(design: dict, reach: int) -> list[tuple[int, str]]:
    """Each opening the wardrobe gets in the way of: [(index, what)] (see _conflicts)."""
    return list(_conflicts(design, reach))


def _conflicts(design: dict, reach: int):
    """Each opening the wardrobe gets in the way of: [(index, what)], what being "swing" (a door's leaf hits the
    carcass), "swing-open" (it hits the wardrobe's open doors or drawers, `reach` mm in front of it), "covered"
    (the wardrobe stands against a door, a passage, or a window below its top) or "walkway" (less than WALKWAY in
    front of a door or a passage)."""
    room = design["room"]
    shape, body = room["shape"], wardrobe_box(design)
    front = wardrobe_box(design, design["dimensions"]["depth"], design["dimensions"]["depth"] + reach) if reach > 0 else None
    for i, o in enumerate(room["openings"]):
        if swing_hits(shape, o, body):
            yield i, "swing"
        elif front and swing_hits(shape, o, front):
            yield i, "swing-open"
        span = (o["wall"], o["at"], o["at"] + o["width"])
        if o["type"] == "window":
            if opening_bottom(o) < design["dimensions"]["height"] and overlaps(body, shape, *span, 0, TOUCH):
                yield i, "covered"
        elif overlaps(body, shape, *span, 0, TOUCH):
            yield i, "covered"
        elif overlaps(body, shape, *span, 0, WALKWAY):
            yield i, "walkway"


# ---------- the floor plan's walls ----------

def _meet(p: Point, u: Point, q: Point, v: Point) -> Point | None:
    denom = u[0] * v[1] - u[1] * v[0]
    if abs(denom) < 1e-9:
        return None
    a = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / denom
    return p[0] + u[0] * a, p[1] + u[1] * a


def footprints(shape: dict, thickness: float = WALL_THICKNESS) -> list[list[Point]]:
    """Each wall's slab on the plan, outside the room: [inner start, inner end, outer end, outer start], the outer
    corners mitred (as viewer/walls3d.js wallFootprints)."""
    pts = corners(shape)
    count = len(pts)
    dirs = []
    for i, p in enumerate(pts):
        q = pts[(i + 1) % count]
        length = math.dist(p, q)
        dirs.append(((q[0] - p[0]) / length, (q[1] - p[1]) / length))
    outer = [(pts[i][0] + u[1] * thickness, pts[i][1] - u[0] * thickness) for i, u in enumerate(dirs)]

    def corner(i: int) -> Point:
        prev = (i - 1) % count
        return _meet(outer[prev], dirs[prev], outer[i], dirs[i]) or outer[i]

    return [[pts[i], pts[(i + 1) % count], corner((i + 1) % count), corner(i)] for i in range(count)]


def wall_pieces(shape: dict, openings: list[dict], thickness: float = WALL_THICKNESS) -> list[list[list[Point]]]:
    """Each wall's slab with the openings cut out of it, as seen in a plan cut: [wall][piece] polygons."""
    out = []
    for i, slab in enumerate(footprints(shape, thickness)):
        start, u, _ = wall_frame(shape, i)
        cuts = sorted((o["at"], o["at"] + o["width"]) for o in openings if o["wall"] == i)
        pieces, poly = [], slab
        for a, b in cuts:
            before = clip(poly, (-u[0], -u[1]), (start[0] + u[0] * a, start[1] + u[1] * a))
            if area(before) > EPS:
                pieces.append(before)
            poly = clip(poly, u, (start[0] + u[0] * b, start[1] + u[1] * b))
        if area(poly) > EPS:
            pieces.append(poly)
        out.append(pieces)
    return out
