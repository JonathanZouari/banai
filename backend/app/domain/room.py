"""The room around the wardrobe (ADR-037): its floor plan from a template, its walls, where the wardrobe stands,
and what that means in front of and beside it. Mirrored in frontend/src/domain/room.js.

The plan is in mm, x to the right and y down, as seen from above. Corners run clockwise on screen, so every
wall's inside is on the right of its direction, and facing a wall from inside the room its start is on the
left. The wardrobe's back stands against wall `room.wall`, its left outer face `room.offset` mm from that
wall's start. Templates keep every wall axis-aligned, so all distances are whole millimetres.
"""

from __future__ import annotations

import math

ROOM_KINDS = ("rect", "l", "recess")
MIN_WALL = 300  # mm: every wall of a template is at least this long
# The wall a new room puts the wardrobe on: the top wall, or the back of the recess (a niche).
DEFAULT_WALL = {"rect": 0, "l": 0, "recess": 2}
# The fields of each template and the limit each takes (defaults.LIMITS).
SHAPE_LIMITS = {
    "rect": {"width": "roomSize", "depth": "roomSize"},
    "l": {"width": "roomSize", "depth": "roomSize", "cutWidth": "roomPart", "cutDepth": "roomPart"},
    "recess": {"width": "roomSize", "depth": "roomSize", "recessX": "roomPart", "recessWidth": "roomPart",
               "recessDepth": "roomPart"},
}


def corners(shape: dict) -> list[tuple[int, int]]:
    """The floor plan's corners, clockwise on screen (y down), starting at the top-left."""
    w, d = shape["width"], shape["depth"]
    if shape["kind"] == "l":  # the top-right corner is cut away
        cw, cd = shape["cutWidth"], shape["cutDepth"]
        return [(0, 0), (w - cw, 0), (w - cw, cd), (w, cd), (w, d), (0, d)]
    if shape["kind"] == "recess":  # a niche going out of the top wall
        rx, rw, rd = shape["recessX"], shape["recessWidth"], shape["recessDepth"]
        return [(0, 0), (rx, 0), (rx, -rd), (rx + rw, -rd), (rx + rw, 0), (w, 0), (w, d), (0, d)]
    return [(0, 0), (w, 0), (w, d), (0, d)]


def walls(shape: dict) -> list[dict]:
    """Each wall: {start, end, length}; wall i runs from corner i to corner i + 1."""
    pts = corners(shape)
    out = []
    for i, start in enumerate(pts):
        end = pts[(i + 1) % len(pts)]
        out.append({"start": start, "end": end, "length": round(math.dist(start, end))})
    return out


def shape_issues(shape: dict) -> list[tuple[str, str]]:
    """Template fields that cannot make a room: [(field, message)]. Ranges are checked separately."""
    w, d = shape["width"], shape["depth"]
    issues = []
    if shape["kind"] == "l":
        if shape["cutWidth"] > w - MIN_WALL:
            issues.append(("cutWidth", f"the cut must leave at least {MIN_WALL} mm of the width"))
        if shape["cutDepth"] > d - MIN_WALL:
            issues.append(("cutDepth", f"the cut must leave at least {MIN_WALL} mm of the depth"))
    elif shape["kind"] == "recess" and shape["recessX"] + shape["recessWidth"] > w - MIN_WALL:
        issues.append(("recessWidth", f"the recess must end at least {MIN_WALL} mm before the right wall"))
    return issues


def centred(room_shape: dict, wall: int, width: int) -> int:
    """The offset that centres a wardrobe `width` wide on `wall` (0 when it is wider than the wall)."""
    return max(0, (walls(room_shape)[wall]["length"] - width) // 2)


def _frame(design: dict):
    """The wardrobe's wall: its start, the unit vector along it and the unit normal into the room."""
    room = design["room"]
    wall = walls(room["shape"])[room["wall"]]
    (x0, y0), (x1, y1) = wall["start"], wall["end"]
    u = ((x1 - x0) / wall["length"], (y1 - y0) / wall["length"])
    return (x0, y0), u, (-u[1], u[0])


def _point(design: dict, along: float, into: float) -> tuple[float, float]:
    """A plan point `along` mm from the wardrobe wall's start and `into` mm into the room."""
    (x0, y0), u, n = _frame(design)
    return x0 + u[0] * along + n[0] * into, y0 + u[1] * along + n[1] * into


def _hit(origin, direction, shape: dict) -> float | None:
    """Distance from `origin` along the unit `direction` to the nearest wall (None when nothing is hit)."""
    best = None
    for wall in walls(shape):
        (ax, ay), (bx, by) = wall["start"], wall["end"]
        ex, ey = bx - ax, by - ay
        denom = direction[0] * ey - direction[1] * ex
        if abs(denom) < 1e-9:  # parallel: never hit
            continue
        qx, qy = ax - origin[0], ay - origin[1]
        t = (qx * ey - qy * ex) / denom
        s = (qx * direction[1] - qy * direction[0]) / denom
        if t >= -1e-9 and -1e-9 <= s <= 1 + 1e-9 and (best is None or t < best):
            best = max(0.0, t)
    return best


def _local(design: dict, point) -> tuple[float, float]:
    """A plan point as (along the wardrobe's wall from its start, into the room)."""
    (x0, y0), u, n = _frame(design)
    dx, dy = point[0] - x0, point[1] - y0
    return dx * u[0] + dy * u[1], dx * n[0] + dy * n[1]


def _inside(poly: list, a: float, b: float) -> bool:
    """Whether (a, b) is inside the polygon or on its boundary."""
    eps = 1e-6
    for i, (pa, pb) in enumerate(poly):
        qa, qb = poly[(i + 1) % len(poly)]
        on_line = abs((qa - pa) * (b - pb) - (qb - pb) * (a - pa)) < eps
        if on_line and min(pa, qa) - eps <= a <= max(pa, qa) + eps and min(pb, qb) - eps <= b <= max(pb, qb) + eps:
            return True
    inside = False
    for i, (pa, pb) in enumerate(poly):
        qa, qb = poly[(i + 1) % len(poly)]
        if (pb > b) != (qb > b) and a < pa + (qa - pa) * (b - pb) / (qb - pb):
            inside = not inside
    return inside


def _crosses(p, q, a0: float, a1: float, b0: float, b1: float) -> bool:
    """Whether the segment p-q passes through the open rectangle (a0, a1) x (b0, b1) (clipped, Liang-Barsky)."""
    da, db = q[0] - p[0], q[1] - p[1]
    t0, t1 = 0.0, 1.0
    for pk, qk in ((-da, p[0] - a0), (da, a1 - p[0]), (-db, p[1] - b0), (db, b1 - p[1])):
        if pk == 0:
            if qk < 0:
                return False
            continue
        r = qk / pk
        if pk < 0:
            t0 = max(t0, r)
        else:
            t1 = min(t1, r)
    if t0 > t1:
        return False
    t = (t0 + t1) / 2  # a chord of a convex box is inside it unless it runs along its edge
    ma, mb = p[0] + da * t, p[1] + db * t
    return a0 + 1e-6 < ma < a1 - 1e-6 and b0 + 1e-6 < mb < b1 - 1e-6


def fits(design: dict) -> bool:
    """Whether the wardrobe's footprint lies inside the room (touching walls is fine). True without a room."""
    room = design.get("room")
    if not room:
        return True
    w, d = design["dimensions"]["width"], design["dimensions"]["depth"]
    a0, a1 = room["offset"], room["offset"] + w
    poly = [_local(design, c) for c in corners(room["shape"])]
    if not all(_inside(poly, a, b) for a, b in ((a0, 0), (a1, 0), (a1, d), (a0, d))):
        return False
    return not any(_crosses(p, poly[(i + 1) % len(poly)], a0, a1, 0, d) for i, p in enumerate(poly))


def _whole(value: float | None) -> int | None:
    return None if value is None else int(math.floor(value + 0.5))


def front_clearance(design: dict) -> int | None:
    """Free floor in front of the wardrobe to the nearest wall, from the room (mm); None without a room or when the
    wardrobe does not fit in it."""
    if not design.get("room") or not fits(design):
        return None
    room, (w, d) = design["room"], (design["dimensions"]["width"], design["dimensions"]["depth"])
    _, _, n = _frame(design)
    hits = [_hit(_point(design, room["offset"] + a, d), n, room["shape"]) for a in (1, w / 2, w - 1)]
    known = [h for h in hits if h is not None]
    return _whole(min(known)) if known else None


def side_gap(design: dict, side: str) -> int | None:
    """Free space beside the wardrobe's `side` ("left"/"right") face to the nearest wall (mm), or None (no room, or
    the wardrobe does not fit in it)."""
    if not design.get("room") or not fits(design):
        return None
    room, (w, d) = design["room"], (design["dimensions"]["width"], design["dimensions"]["depth"])
    _, u, _ = _frame(design)
    along = room["offset"] if side == "left" else room["offset"] + w
    direction = (-u[0], -u[1]) if side == "left" else u
    hits = [_hit(_point(design, along, b), direction, room["shape"]) for b in (1, d / 2, d - 1)]
    known = [h for h in hits if h is not None]
    return _whole(min(known)) if known else None


def effective_clearance(design: dict) -> int | None:
    """The free floor in front of the wardrobe: the customer's measurement, else the room's."""
    measured = (design.get("site") or {}).get("clearance")
    return measured if measured is not None else front_clearance(design)
