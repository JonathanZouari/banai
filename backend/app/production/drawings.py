"""Vector shop drawings for the dossier (port of drawings.js in the P2 prototype), as SVG strings.

Generated from the layout and the cut list, never from a screenshot. Units are mm in each drawing's
own coordinates; the viewBox scales it to the page. Elevations draw in model coordinates (y up) inside
a `scale(1,-1)` group, and dimensions in screen coordinates (y down) on top. Every text node and
attribute value is escaped, so a custom appearance name can't inject markup. Numbers carry
`direction="ltr"` so the RTL page doesn't reorder them; in RTL, `text-anchor: start` is the right edge.
Each drawing prefixes its pattern and marker ids, because all of them share one HTML document.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from itertools import pairwise

from markupsafe import Markup, escape

from app.domain.defaults import SHOE_TIER
from app.domain.layout import DOOR_GAP, SLIDE_TOP_TRACK, DoorLayout, Layout
from app.domain.room import corners, furniture_corners, walls
from app.domain.room_plan import WALL_THICKNESS, hinge_point, wall_frame, wall_pieces, wardrobe_box
from app.i18n import tr
from app.production.boards import Board, board_for, handle_of, resolve
from app.production.nesting import SHEET, Sheet
from app.production.parts import DRAWER_GAP, INNER_Z, LRI, PDI, PLINTH_FLOOR_GAP, SHOE_RISE, Part, Production, half_up

WALL = 140  # wall thickness drawn around a niche
NICHE_WALLS = 400  # walls are drawn when the niche is at most this much wider than the wardrobe
HANDLE_Y, HANDLE_HALF = 1050, 170  # bar handle centre above the floor, and half its length
HANDLE_MARGIN = 110  # a handle's centre stays this far inside a door's ends (the viewer's rule)
HINGE_END, CUP_R, CUP_INSET = 100, 17.5, 22.5  # outer hinge cups from the door's ends; a Ø35 cup [1], its centre from the edge
ISO_C, ISO_S = math.cos(math.pi / 6), 0.5


# ---------- a tiny SVG builder ----------

def _num(v: float) -> str:
    if isinstance(v, int):
        return str(v)
    out = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if out == "-0" else out


class El:
    """An SVG element. Attribute values and text children are escaped when serialized."""

    __slots__ = ("attrs", "children", "tag")

    def __init__(self, tag: str, attrs: dict | None = None, *children: El | str) -> None:
        self.tag, self.attrs, self.children = tag, attrs or {}, list(children)

    def add(self, *children: El | str) -> El:
        self.children.extend(children)
        return self

    def __str__(self) -> str:
        attrs = "".join(f' {k}="{escape(_num(v) if isinstance(v, float | int) else str(v))}"'
                        for k, v in self.attrs.items() if v is not None)
        inner = "".join(str(c) if isinstance(c, El) else str(escape(c)) for c in self.children)
        return f"<{self.tag}{attrs}>{inner}</{self.tag}>"


def _kw(attrs: dict) -> dict:
    """Python keywords to SVG attribute names: `class_` -> `class`, `font_size` -> `font-size`."""
    return {k.rstrip("_").replace("_", "-"): v for k, v in attrs.items()}


def text(x: float, y: float, value: object, **attrs) -> El:
    return El("text", {"x": x, "y": y, **_kw(attrs)}, str(value))


def rect(x: float, y: float, w: float, h: float, cls: str, **attrs) -> El:
    return El("rect", {"x": x, "y": y, "width": w, "height": h, "class": cls, **_kw(attrs)})


def line(x1: float, y1: float, x2: float, y2: float, cls: str) -> El:
    return El("line", {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "class": cls})


class Canvas:
    """One drawing: the root <svg> with its own hatch, glass and tick definitions, and dimension lines."""

    def __init__(self, uid: str, x: float, y: float, w: float, h: float, fs: float) -> None:
        self.uid, self.fs = uid, fs
        self.svg = El("svg", {"xmlns": "http://www.w3.org/2000/svg", "viewBox": " ".join(_num(v) for v in (x, y, w, h)),
                              "class": "drawing", "preserveAspectRatio": "xMidYMid meet"})
        hatch, glass = fs * 0.55, fs * 1.6
        self.svg.add(El("defs", {},
                        El("pattern", {"id": f"{uid}-hatch", "width": hatch, "height": hatch, "patternUnits": "userSpaceOnUse",
                                       "patternTransform": "rotate(45)"},
                           line(0, 0, 0, hatch, "hatch-line")),
                        El("pattern", {"id": f"{uid}-glass", "width": glass, "height": glass, "patternUnits": "userSpaceOnUse",
                                       "patternTransform": "rotate(-35)"},
                           line(0, 0, 0, fs * 0.7, "glass-line")),
                        El("marker", {"id": f"{uid}-tick", "viewBox": "-5 -5 10 10", "markerWidth": 6, "markerHeight": 6,
                                      "orient": "auto"},
                           line(-3, 3, 3, -3, "tick"))))

    def url(self, name: str) -> str:
        return f"url(#{self.uid}-{name})"

    def dim(self, g: El, x1: float, y1: float, x2: float, y2: float, label: object, fs: float, offset: float = 0,
            ext: bool = True) -> None:
        """A dimension line between two points (screen coords), `offset` away from them."""
        grp = El("g", {"class": "dim"})
        sign = 1 if offset > 0 else -1
        ticks = {"marker-start": self.url("tick"), "marker-end": self.url("tick")}
        if abs(y2 - y1) < 1e-6:
            y = y1 + offset
            if ext and offset:
                grp.add(line(x1, y1, x1, y + sign * fs * 0.3, "ext"), line(x2, y1, x2, y + sign * fs * 0.3, "ext"))
            grp.add(El("line", {"x1": x1, "y1": y, "x2": x2, "y2": y, **ticks}),
                    text((x1 + x2) / 2, y - fs * 0.35, label, font_size=fs, class_="dim-text", direction="ltr"))
        else:
            x = x1 + offset
            if ext and offset:
                grp.add(line(x1, y1, x + sign * fs * 0.3, y1, "ext"), line(x2, y2, x + sign * fs * 0.3, y2, "ext"))
            grp.add(El("line", {"x1": x, "y1": y1, "x2": x, "y2": y2, **ticks}))
            ty = (y1 + y2) / 2
            if abs(y2 - y1) < fs * 1.8:  # too short for the label along it: write it level, beside the line
                grp.add(text(x + fs * 0.3, ty + fs * 0.35, label, font_size=fs, class_="dim-text dim-text--side", direction="ltr"))
            else:
                tx = x - fs * 0.35
                grp.add(text(tx, ty, label, font_size=fs, class_="dim-text", direction="ltr",
                             transform=f"rotate(-90 {_num(tx)} {_num(ty)})"))
        g.add(grp)

    def markup(self) -> Markup:
        """Safe to mark: El escaped every attribute value and text node."""
        return Markup(str(self.svg))


# ---------- shared ----------

def _site(design: dict, lay: Layout) -> tuple[int | None, int | None, float]:
    site = design["site"] or {}
    ceiling, niche = site.get("ceiling"), site.get("niche")
    return ceiling, niche, max(0, (niche - lay.width) / 2) if niche else 0


def _walls(niche: int | None, lay: Layout) -> bool:
    return bool(niche) and niche - lay.width <= NICHE_WALLS


def _door_boards(design: dict, catalog: dict) -> list[Board]:
    app = design["doors"]["appearance"]
    return [board_for(resolve(d["appearance"], app), design["carcass"]["panelThickness"], catalog)
            for d in design["doors"]["items"]]


def item_tops(c: dict) -> list[int]:
    """Interior tops of everything a rail can hang above."""
    tops = [s["y"] + s["thickness"] for s in c["shelves"]] + [d["y"] + d["height"] for d in c["drawers"]]
    return tops + [x["y"] + (x["tiers"] * SHOE_TIER if x["type"] == "shoes" else x["height"])
                   for x in c["inserts"] if x["type"] in ("shoes", "trousers", "tv")]


def _compartment(g: El, design: dict, lay: Layout, i: int) -> None:
    """The items of one compartment, in model coordinates (y up)."""
    c = design["compartments"][i]
    x0, x1 = lay.ranges[i]
    w, y0 = x1 - x0, lay.floor_y(0)
    for s in c["shelves"]:  # a divider (fixed shelf) is drawn as structure, like the carcass
        g.add(rect(x0, y0 + s["y"], w, s["thickness"], "shelf shelf--fixed" if s["fixed"] else "shelf"))
    tops = item_tops(c)
    for r in c["rails"]:
        y = y0 + r["y"]
        base = max((t for t in tops if t <= r["y"]), default=0)  # the hanging zone runs down to the next item
        g.add(line(x0 + 20, y, x1 - 20, y, "rail"), rect(x0 + w * 0.18, y0 + base + 40, w * 0.64, max(0, r["y"] - base - 80), "zone"))
    for d in c["drawers"]:
        fy, fh = y0 + d["y"] + DRAWER_GAP / 2, d["height"] - DRAWER_GAP
        g.add(rect(x0 + 2, fy, w - 4, fh, "drawer"))
        style, cx, hy = handle_of(d, design)["style"], x0 + w / 2, fy + fh * 0.72
        if style == "knob":
            g.add(El("circle", {"cx": cx, "cy": hy, "r": 12, "class": "handle"}))
        elif style in ("bar", "cup"):
            half = 64 if style == "bar" else 40
            g.add(line(cx - half, hy, cx + half, hy, "handle-line"))
        elif style in ("edge", "groove"):
            g.add(line(x0 + 8, fy + fh - 6, x1 - 8, fy + fh - 6, "handle-line" if style == "edge" else "ln-thin"))
    for ins in c["inserts"]:
        y = y0 + (ins["y"] or 0)
        if ins["type"] == "shoes":  # sloped tiers: the shelf, and the front rod that stops the shoes
            for k in range(ins["tiers"]):
                ty = y + k * SHOE_TIER + SHOE_RISE
                g.add(line(x0 + 6, ty + 40, x1 - 6, ty + 40, "shelf-line"), line(x0 + 6, ty + 4, x1 - 6, ty + 4, "rail rail--thin"))
        elif ins["type"] == "trousers":
            top = y + ins["height"]
            g.add(rect(x0 + 24, y + 40, w - 48, max(0, ins["height"] - 80), "zone"), line(x0 + 30, top - 60, x1 - 30, top - 60, "rail rail--thin"))
        elif ins["type"] == "tv":  # the screen, 16:9, centred in the compartment
            sw = ins["height"] * 16 / 9  # the real width: a screen too wide shows as one (R25)
            g.add(rect(x0 + (w - sw) / 2, y, sw, ins["height"], "zone"))
        elif ins["type"] == "pulldown":
            g.add(line(x0 + 30, y, x1 - 30, y, "rail"), line(x0 + w / 2, y, x0 + w / 2, y - 420, "ln-thin"))
        elif ins["type"] == "led":
            ly = lay.height - lay.panel - 8
            g.add(line(x0 + 20, ly, x1 - 20, ly, "led"))


def _interior(design: dict, lay: Layout, only: Iterable[int] | None = None) -> El:
    """The open carcass with every compartment, or only some compartments' openings and items."""
    g = El("g")
    y0, hi, P = lay.floor_y(0), lay.interior_height, lay.panel
    if only is None:
        g.add(rect(0, 0, lay.width, lay.height, "body"), rect(P, y0, lay.width - 2 * P, hi, "inside"))
        for i, prt in enumerate(design["partitions"]):
            g.add(rect(lay.ranges[i][1], y0, prt["thickness"], hi, "body"))
        indices = list(range(len(lay.ranges)))
    else:
        indices = list(only)
        for i in indices:
            g.add(rect(lay.ranges[i][0], y0, lay.ranges[i][1] - lay.ranges[i][0], hi, "inside"))
    for i in indices:
        _compartment(g, design, lay, i)
    return g


def _open_spans(lay: Layout, i: int) -> list[tuple[float, float]]:
    """Heights above the floor of compartment i's interior that no hinged door covers: its open zones.
    A door covers up to the centre lines of its anchors (its edges plus half a joint)."""
    low, high = lay.floor_y(0), lay.floor_y(lay.interior_height)
    covered = sorted((d.y0 - DOOR_GAP / 2, d.y0 + d.height + DOOR_GAP / 2) for d in lay.doors if i in d.compartments)
    spans, at = [], low
    for a, b in covered:
        if a > at:
            spans.append((at, min(a, high)))
        at = max(at, b)
    if at < high:
        spans.append((at, high))
    return [(a, b) for a, b in spans if b > a]


def _open_zones(cv: Canvas, design: dict, lay: Layout, i: int, spans: list[tuple[float, float]]) -> El:
    """The interior of a compartment's open zones, beside its zone doors: the items are clipped to the spans."""
    x0, x1 = lay.ranges[i]
    clip = f"open{i}"
    g = El("g", {}, El("clipPath", {"id": f"{cv.uid}-{clip}"}, *(rect(x0, a, x1 - x0, b - a, None) for a, b in spans)),
           *(rect(x0, a, x1 - x0, b - a, "inside") for a, b in spans))
    items = El("g", {"clip-path": cv.url(clip)})
    _compartment(items, design, lay, i)
    return g.add(items)


def _hinge_marks(g: El, d: DoorLayout) -> None:
    """The door's hinge cups, hidden behind it: evenly spaced, the outer ones HINGE_END from its ends."""
    end = min(HINGE_END, d.height / 4)
    x = d.x0 + CUP_INSET if d.hinge == "left" else d.x0 + d.width - CUP_INSET
    for k in range(d.hinges):
        y = d.y0 + end + k * (d.height - 2 * end) / max(1, d.hinges - 1)
        g.add(El("circle", {"cx": x, "cy": y, "r": CUP_R, "class": "hinge-mark"}))


def _door_handle(g: El, d: DoorLayout, style: str) -> None:
    left = d.hinge != "right"  # the handle sits on the edge opposite the hinge
    edge = d.x0 + d.width if left else d.x0
    hx = edge - 42 if left else edge + 42
    # HANDLE_Y above the floor, kept inside the door, as in the viewer: a zone door above that height has its
    # handle near its bottom edge, and one below it near its top edge.
    half = {"bar": HANDLE_HALF, "cup": 45, "knob": 14}.get(style, 0)
    limit = max(0.0, d.height / 2 - max(HANDLE_MARGIN, half + 40))
    centre = d.y0 + d.height / 2
    cy = centre + max(-limit, min(limit, HANDLE_Y - centre))
    if style == "bar":
        g.add(rect(hx - 7, cy - HANDLE_HALF, 14, 2 * HANDLE_HALF, "handle", rx=7))
    elif style == "knob":
        g.add(El("circle", {"cx": hx, "cy": cy, "r": 14, "class": "handle"}))
    elif style == "cup":
        g.add(rect(hx - 15, cy - 45, 30, 90, "handle", rx=15))
    elif style == "edge":
        g.add(rect(edge - 14 if left else edge, d.y0, 14, d.height, "handle"))
    elif style == "groove":
        x = edge - 6 if left else edge + 6
        g.add(line(x, d.y0 + 4, x, d.y0 + d.height - 4, "ln-thin"))


# ---------- elevations ----------

def front_elevation(design: dict, lay: Layout, catalog: dict, uid: str = "fe") -> Markup:
    W, H, P = lay.width, lay.height, lay.panel
    ceiling, niche, gap = _site(design, lay)
    ceil = ceiling or H
    fs = max(W, ceil) / 38
    cv = Canvas(uid, -gap - WALL - fs * 4, -(ceil + fs * 5), W + 2 * (gap + WALL) + fs * 8, ceil + fs * 10, fs)
    g = El("g", {"transform": "scale(1,-1)"})
    cv.svg.add(g)
    # Floor, niche walls and the ceiling line.
    g.add(rect(-gap - WALL - fs * 2, -fs * 0.9, W + 2 * (gap + WALL) + fs * 4, fs * 0.9, "cut", fill=cv.url("hatch")),
          line(-gap - WALL - fs * 2, 0, W + gap + WALL + fs * 2, 0, "ln-heavy"))
    if _walls(niche, lay):
        for x in (-gap - WALL, W + gap):
            g.add(rect(x, 0, WALL, ceil, "cut", fill=cv.url("hatch")))
    if ceiling:
        g.add(line(-gap, ceiling, W + gap, ceiling, "ln-dash"))
    doors_type, items = design["doors"]["type"], design["doors"]["items"]
    if doors_type == "none":
        g.add(_interior(design, lay))
    else:
        if lay.legs:  # the body stands on legs: a leg under each side and partition
            g.add(rect(0, lay.plinth, W, H - lay.plinth, "body"))
            for x in [P / 2, *(r[1] + P / 2 for r in lay.ranges[:-1]), W - P / 2]:
                g.add(rect(x - 15, 0, 30, lay.plinth, "body"))
        else:
            g.add(rect(0, 0, W, H, "body"))
        if lay.plinth > PLINTH_FLOOR_GAP and not lay.legs:
            g.add(rect(P, 0, W - 2 * P, lay.plinth - PLINTH_FLOOR_GAP, "recess"))
        boards = _door_boards(design, catalog)
        if doors_type == "hinged":
            covered = {i for d in lay.doors for i in d.compartments}
            open_comps = [i for i in range(len(lay.ranges)) if i not in covered]
            if open_comps:  # compartments no door covers stay open in the front view
                g.add(_interior(design, lay, open_comps))
            for i in sorted(covered):  # and so do the open zones beside zone doors
                if spans := _open_spans(lay, i):
                    g.add(_open_zones(cv, design, lay, i, spans))
            for door, d, b in zip(items, lay.doors, boards, strict=True):
                g.add(rect(d.x0, d.y0, d.width, d.height, "front", fill=b.tint))
                if d.mirror:  # a zone door can be short: never a negative size
                    g.add(rect(d.x0 + 35, d.y0 + 35, max(0, d.width - 70), max(0, d.height - 70), "mirror", fill=cv.url("glass")))
                # Opening convention: lines from the handle-edge corners to the middle of the hinge edge.
                hx, ox = (d.x0, d.x0 + d.width) if d.hinge == "left" else (d.x0 + d.width, d.x0)
                points = [(ox, d.y0), (hx, d.y0 + d.height / 2), (ox, d.y0 + d.height)]
                g.add(El("polyline", {"points": " ".join(f"{_num(px)},{_num(py)}" for px, py in points), "class": "ln-swing"}))
                _hinge_marks(g, d)
                _door_handle(g, d, handle_of(door, design)["style"])
        else:
            back_first = sorted(range(len(lay.doors)), key=lambda k: lay.doors[k].track != "back")
            for k in back_first:
                d, b = lay.doors[k], boards[k]
                g.add(rect(d.x0, d.y0, d.width, d.height, "front front--near" if d.track == "front" else "front", fill=b.tint))
                if d.mirror:
                    g.add(rect(d.x0 + 35, d.y0 + 35, d.width - 70, d.height - 70, "mirror", fill=cv.url("glass")))
            g.add(rect(P, H - P - SLIDE_TOP_TRACK, W - 2 * P, SLIDE_TOP_TRACK, "track"))

    t = El("g")  # screen coordinates: up is negative
    cv.svg.add(t)
    cv.dim(t, 0, 0, W, 0, W, fs, offset=fs * 2.6)
    if doors_type == "hinged":
        # Door widths over the top, once per span. A door that doesn't reach the top (under an open zone, or a
        # pair in a lower zone) has its width just inside its own top edge, once per span.
        top_row = sorted({(d.x0, d.width) for d in lay.doors if d.anchors[1] is None})
        for x0, w in top_row:
            cv.dim(t, x0 - DOOR_GAP / 2, -H, x0 + w + DOOR_GAP / 2, -H, half_up(w), fs * 0.8, offset=-fs * 1.6)
        inner: dict[tuple[float, float], float] = {}
        for d in lay.doors:
            if (d.x0, d.width) not in top_row:
                inner[(d.x0, d.width)] = max(inner.get((d.x0, d.width), 0), d.y0 + d.height)
        for (x0, w), top in sorted(inner.items()):
            cv.dim(t, x0, -top, x0 + w, -top, half_up(w), fs * 0.7, offset=fs * 0.9, ext=False)
    if doors_type != "sliding":
        # Zone heights of a zoned column, between the centre lines of its dividers (where zone doors meet),
        # rounded as positions so the chain adds up. The end columns' chains run outside the carcass: the left
        # one continues the plinth's chain, the right one sits inside the overall height. A middle column's
        # runs inside it, at 0.3 of its width: clear of a pair's joint and handles, and of the width labels.
        last = len(lay.ranges) - 1
        for i, c in enumerate(design["compartments"]):
            fixed = sorted((s for s in c["shelves"] if s["fixed"]), key=lambda s: s["y"])
            if not fixed:
                continue
            marks = [lay.plinth, *(half_up(lay.floor_y(s["y"]) + s["thickness"] / 2) for s in fixed), H]
            x0, x1 = lay.ranges[i]
            x, offset = (0, -fs * 1.4) if i == 0 else (W, fs * 1.0) if i == last else (x0 + 0.3 * (x1 - x0), 0)
            for a, b in pairwise(marks):
                cv.dim(t, x, -a, x, -b, b - a, fs * 0.75, offset=offset)
    cv.dim(t, W, 0, W, -H, H, fs, offset=fs * 2.2)
    if lay.plinth:
        cv.dim(t, 0, 0, 0, -lay.plinth, lay.plinth, fs * 0.75, offset=-fs * 1.4)
    if ceiling:
        if ceiling > H:
            cv.dim(t, W, -H, W, -ceiling, ceiling - H, fs * 0.75, offset=fs * 2.2)
        t.add(text(-gap + fs * 3.2, -ceiling - fs * 0.45, tr("תקרה {c}", c=ceiling), font_size=fs * 0.8, class_="note"))
    if gap > 0 and _walls(niche, lay):
        cv.dim(t, -gap, -ceil * 0.42, 0, -ceil * 0.42, half_up(gap), fs * 0.7, ext=False)
    return cv.markup()


def interior_elevation(design: dict, lay: Layout, uid: str = "ie") -> Markup:
    W, H = lay.width, lay.height
    fs = max(W, H) / 40
    cv = Canvas(uid, -fs * 4, -(H + fs * 5), W + fs * 8, H + fs * 9, fs)
    cv.svg.add(El("g", {"transform": "scale(1,-1)"}, line(-fs * 2, 0, W + fs * 2, 0, "ln-heavy"), _interior(design, lay)))
    t = El("g")
    cv.svg.add(t)
    for i, (x0, x1) in enumerate(lay.ranges):
        cv.dim(t, x0, -H, x1, -H, x1 - x0, fs * 0.8, offset=-fs * 1.6)
        t.add(text((x0 + x1) / 2, -(lay.floor_y(0) + lay.interior_height / 2), i + 1, font_size=fs * 1.6, class_="comp-no"))
    cv.dim(t, 0, 0, W, 0, W, fs, offset=fs * 2.4)
    cv.dim(t, W, 0, W, -H, H, fs, offset=fs * 2.2)
    return cv.markup()


def compartment_elevation(design: dict, lay: Layout, i: int, uid: str | None = None) -> Markup:
    """One compartment, with a chain of heights measured from the floor."""
    H, P = lay.height, lay.panel
    x0, x1 = lay.ranges[i]
    prts = design["partitions"]
    lt = P if i == 0 else prts[i - 1]["thickness"]
    rt = P if i == len(lay.ranges) - 1 else prts[i]["thickness"]
    fs = H / 26
    cv = Canvas(uid or f"ce{i}", x0 - lt - fs * 1.5, -(H + fs * 2.4), x1 - x0 + lt + rt + fs * 9, H + fs * 4.4, fs)
    g = El("g", {"transform": "scale(1,-1)"})
    y0 = lay.floor_y(0)
    g.add(line(x0 - lt - fs, 0, x1 + rt + fs, 0, "ln-heavy"), rect(x0 - lt, 0, x1 - x0 + lt + rt, H, "body"),
          rect(x0, y0, x1 - x0, lay.interior_height, "inside"))
    _compartment(g, design, lay, i)
    cv.svg.add(g)
    c = design["compartments"][i]
    marks = {0, y0, H - P} | {y0 + top for top in item_tops(c)} | {y0 + r["y"] for r in c["rails"]}
    marks |= {y0 + x["y"] for x in c["inserts"] if x["type"] == "pulldown"}
    marks |= {y0 + s["y"] for s in c["shelves"] if s["fixed"]}  # both faces of a divider bound a zone's usable height
    ys = sorted({half_up(m) for m in marks})
    t = El("g")
    cv.svg.add(t)
    x = x1 + rt
    for a, b in pairwise(ys):
        cv.dim(t, x, -a, x, -b, b - a, fs * 0.7, offset=fs * 1.4)
    cv.dim(t, x, 0, x, -H, H, fs * 0.8, offset=fs * 3.8)
    cv.dim(t, x0, 0, x1, 0, x1 - x0, fs * 0.8, offset=fs * 1.6)
    return cv.markup()


# ---------- plan ----------

def plan_view(design: dict, lay: Layout, catalog: dict, partition_depth: int, uid: str = "pl") -> Markup:
    W, D, P = lay.width, lay.depth, lay.panel
    _, niche, gap = _site(design, lay)
    hinged = design["doors"]["type"] == "hinged"
    max_door = max((d.width for d in lay.doors), default=0) if hinged else 0
    reach = D + max(max_door, 300)
    fs = max(W, reach) / 40  # P2 used W / 40, which shrinks the text of a narrow, deep plan
    depth_out = reach + fs * 2
    cv = Canvas(uid, -gap - WALL - fs * 3, -WALL - fs * 2, W + 2 * (gap + WALL) + fs * 6, depth_out + WALL + fs * 6, fs)
    svg = cv.svg
    # Back wall and niche walls, cut and hatched.
    svg.add(rect(-gap - WALL, -WALL, W + 2 * (gap + WALL), WALL, "cut", fill=cv.url("hatch")))
    if _walls(niche, lay):
        for x in (-gap - WALL, W + gap):
            svg.add(rect(x, 0, WALL, D + 180, "cut", fill=cv.url("hatch")))
    svg.add(rect(0, 0, P, D, "body"), rect(W - P, 0, P, D, "body"), line(P, 8, W - P, 8, "ln-thin"))
    for i, prt in enumerate(design["partitions"]):
        svg.add(rect(lay.ranges[i][1], INNER_Z, prt["thickness"], partition_depth, "body"))
    rail_z = INNER_Z + (lay.shelf_depth - INNER_Z) / 2
    for i, c in enumerate(design["compartments"]):
        if c["rails"] or any(x["type"] == "pulldown" for x in c["inserts"]):
            svg.add(line(lay.ranges[i][0] + 20, rail_z, lay.ranges[i][1] - 20, rail_z, "rail"))
    seen: set[tuple] = set()
    for d, b in zip(lay.doors, _door_boards(design, catalog), strict=True):
        if (d.x0, d.width, d.hinge, d.track, b.tint) in seen:  # zone doors stacked in one column: one section
            continue
        seen.add((d.x0, d.width, d.hinge, d.track, b.tint))
        if hinged:
            left = d.hinge == "left"
            hx, ex, z = (d.x0, d.x0 + d.width, D + 1) if left else (d.x0 + d.width, d.x0, D + 1)
            # Closed (ghost), open at 90 degrees, and the swing arc.
            svg.add(rect(d.x0, z, d.width, P, "front front--ghost", fill=b.tint),
                    rect(hx if left else hx - P, z, P, d.width, "front", fill=b.tint),
                    El("path", {"d": f"M {_num(ex)} {_num(z)} A {_num(d.width)} {_num(d.width)} 0 0 {1 if left else 0} "
                                     f"{_num(hx)} {_num(z + d.width)}", "class": "ln-swing"}))
        else:
            svg.add(rect(d.x0, D - (30 if d.track == "front" else 60), d.width, P, "front", fill=b.tint))
    cv.dim(svg, 0, 0, W, 0, W, fs, offset=-fs * 0.8 - WALL)
    cv.dim(svg, W, 0, W, D, D, fs, offset=gap + WALL + fs * 1.6)
    if max_door:
        swing = half_up(max_door)
        svg.add(line(-gap, D + P + max_door, W + gap, D + P + max_door, "ln-dash"))
        cv.dim(svg, -gap, D, -gap, D + max_door, swing, fs * 0.8, offset=-fs * 1.6)
        svg.add(text(W / 2, D + max_door + fs * 1.6, tr("מרחב פתיחה נדרש מול הארון: {mm} מ״מ", mm=swing), font_size=fs * 0.8, class_="note"))
    return cv.markup()


# ---------- the room's floor plan (ADR-037) ----------

def _points(poly: Iterable[tuple[float, float]]) -> str:
    return " ".join(f"{_num(round(x, 1))},{_num(round(y, 1))}" for x, y in poly)


def room_plan(design: dict, uid: str = "rp") -> Markup:
    """The room from above, to scale: the walls cut through with their openings, each wall's number and length,
    the doors' swings, and the wardrobe on its wall with its distance from the wall's left end (mm)."""
    room = design["room"]
    shape, t = room["shape"], WALL_THICKNESS
    pieces = wall_pieces(shape, room["openings"])
    outline = [p for slab in pieces for poly in slab for p in poly] + [(float(x), float(y)) for x, y in corners(shape)]
    x0, x1 = min(p[0] for p in outline), max(p[0] for p in outline)
    y0, y1 = min(p[1] for p in outline), max(p[1] for p in outline)
    fs = max(x1 - x0, y1 - y0) / 38
    pad = fs * 4.5
    cv = Canvas(uid, x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad + fs * 2, fs)
    svg = cv.svg
    svg.attrs["class"] = "drawing room-plan"  # a room is drawn smaller than a wardrobe: heavier lines (dossier.css)
    svg.add(El("polygon", {"points": _points(corners(shape)), "class": "floor"}))
    for slab in pieces:
        for poly in slab:
            svg.add(El("polygon", {"points": _points(poly), "class": "cut", "fill": cv.url("hatch")}))

    def at(frame, along: float, into: float) -> tuple[float, float]:
        (sx, sy), u, n = frame
        return sx + u[0] * along + n[0] * into, sy + u[1] * along + n[1] * into

    for k, o in enumerate(room["openings"], 1):
        frame = wall_frame(shape, o["wall"])
        _, u, n = frame
        a0, a1 = o["at"], o["at"] + o["width"]
        if o["type"] == "door":
            (hx, hy), along = hinge_point(shape, o)
            out = o["swing"] == "out"
            normal = (-n[0], -n[1]) if out else n
            bx, by = (hx - n[0] * t, hy - n[1] * t) if out else (hx, hy)  # an outward door hangs on the outer face
            w = o["width"]
            closed, opened = (bx + along[0] * w, by + along[1] * w), (bx + normal[0] * w, by + normal[1] * w)
            sweep = 1 if along[0] * normal[1] - along[1] * normal[0] > 0 else 0  # clockwise on screen (y down)
            svg.add(line(bx, by, *opened, "ln-heavy"),
                    El("path", {"d": f"M {_num(round(closed[0], 1))} {_num(round(closed[1], 1))} A {w} {w} 0 0 {sweep} "
                                     f"{_num(round(opened[0], 1))} {_num(round(opened[1], 1))}", "class": "ln-swing"}))
        elif o["type"] == "window":
            for into in (0, -t / 2, -t):
                svg.add(line(*at(frame, a0, into), *at(frame, a1, into), "ln-thin"))
        else:
            svg.add(line(*at(frame, a0, 0), *at(frame, a1, 0), "ln-dash"))
        tx, ty = at(frame, (a0 + a1) / 2, -t - fs * 1.1)
        svg.add(El("circle", {"cx": round(tx, 1), "cy": round(ty, 1), "r": round(fs * 0.75, 1), "class": "room-tag"}),
                text(round(tx, 1), round(ty + fs * 0.33, 1), k, font_size=fs * 0.9, class_="room-tag-no", direction="ltr"))

    for i, wall in enumerate(walls(shape)):
        frame = wall_frame(shape, i)
        u = frame[1]
        mx, my = at(frame, wall["length"] / 2, -t - fs * (2.6 if any(o["wall"] == i for o in room["openings"]) else 1.1))
        angle = round(math.degrees(math.atan2(u[1], u[0])))
        if angle > 90 or angle <= -90:  # never upside down
            angle += 180
        mx, my = round(mx, 1), round(my, 1)
        svg.add(text(mx, my + fs * 0.35, tr("קיר {n} · {l}", n=i + 1, l=wall["length"]), font_size=fs * 0.85, class_="note",
                     transform=f"rotate({angle} {_num(mx)} {_num(my)})"))

    # Free-standing furniture (ADR-041): its footprint, named.
    names = {"bed": tr("מיטה"), "dresser": tr("שידה"), "desk": tr("שולחן"), "mirror": tr("מראה")}
    for f in room.get("furniture") or []:
        pts = furniture_corners(f)
        svg.add(El("polygon", {"points": _points(pts), "class": "furniture"}))
        fx, fy = sum(p[0] for p in pts) / 4, sum(p[1] for p in pts) / 4
        svg.add(text(round(fx, 1), round(fy + fs * 0.3, 1), names.get(f["type"], ""), font_size=fs * 0.8, class_="note"))

    body = wardrobe_box(design)
    svg.add(El("polygon", {"points": _points(body), "class": "body wardrobe"}))
    cx, cy = sum(p[0] for p in body) / 4, sum(p[1] for p in body) / 4
    svg.add(text(round(cx, 1), round(cy + fs * 0.35, 1), tr("ארון"), font_size=fs, class_="note"))
    # Where the wardrobe stands: its left end's distance from the wall's start, and its width (axis-aligned walls).
    frame = wall_frame(shape, room["wall"])
    _, u, n = frame
    d, w, off = design["dimensions"]["depth"], design["dimensions"]["width"], room["offset"]
    for a, b in ((0, off), (off, off + w)):
        if b - a < 1:
            continue
        (px, py), (qx, qy) = at(frame, a, 0), at(frame, b, 0)
        if abs(u[1]) < 1e-9:
            cv.dim(svg, px, py, qx, qy, b - a, fs * 0.8, offset=n[1] * (d + fs * 1.6))
        elif abs(u[0]) < 1e-9:
            cv.dim(svg, px, py, qx, qy, b - a, fs * 0.8, offset=n[0] * (d + fs * 1.6))

    # A metre to scale.
    sx, sy = x0, y1 + pad * 0.75
    svg.add(line(sx, sy, sx + 1000, sy, "ln-heavy"), line(sx, sy - fs * 0.4, sx, sy + fs * 0.4, "ln-thin"),
            line(sx + 1000, sy - fs * 0.4, sx + 1000, sy + fs * 0.4, "ln-thin"),
            text(sx + 1000 + fs * 0.6, sy + fs * 0.3, tr("1 מ׳"), font_size=fs * 0.8, class_="note", text_anchor="start"))
    return cv.markup()


# ---------- exploded isometric ----------

def _iso(p: tuple[float, float, float]) -> tuple[float, float]:
    x, y, z = p
    return (x - z) * ISO_C, (x + z) * ISO_S - y


def is_dark(hex_color: str) -> bool:
    n = int(hex_color[1:7], 16)
    return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 < 0.45


def shade(hex_color: str, k: float) -> str:
    n = int(hex_color[1:7], 16)
    r, g, b = (min(255, half_up(((n >> s) & 255) * k)) for s in (16, 8, 0))
    return f"rgb({r},{g},{b})"


def exploded_view(prod: Production, magnitude: float = 420, uid: str = "ex") -> Markup:
    items = []
    for part in prod.parts:
        for b in part.boxes:
            lo = [v + b.explode[k] * magnitude for k, v in enumerate(b.min)]
            hi = [v + b.explode[k] * magnitude for k, v in enumerate(b.max)]
            items.append((sum(lo) + sum(hi), part, lo, hi))
    items.sort(key=lambda it: it[0])  # painter's order: back, left and low first
    polys = []
    xs: list[float] = []
    ys: list[float] = []
    for _, part, (x0, y0, z0), (x1, y1, z1) in items:
        faces = [
            ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], 1.06),  # top
            ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], 0.96),  # front
            ([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], 0.8),  # right
        ]
        projected = [([_iso(p) for p in pts], k) for pts, k in faces]
        for pts, _ in projected:
            xs += [p[0] for p in pts]
            ys += [p[1] for p in pts]
        polys.append((part, (x1 - x0, y1 - y0, z1 - z0), projected))
    bx0, by0, bx1, by1 = (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 100, 100)
    fs = (bx1 - bx0) / 52
    pad = fs * 3
    cv = Canvas(uid, bx0 - pad, by0 - pad, bx1 - bx0 + 2 * pad, by1 - by0 + 2 * pad, fs)
    labels: dict[int, tuple[float, float]] = {}
    for part, size, projected in polys:
        g = El("g", {"class": "iso-part"})
        for pts, k in projected:
            g.add(El("polygon", {"points": " ".join(f"{_num(px)},{_num(py)}" for px, py in pts),
                                 "fill": shade(part.board.tint, k), "class": "iso-face"}))
        cv.svg.add(g)
        if part.no not in labels:  # the balloon goes on the largest face of the first box drawn
            thin = size.index(min(size))
            face = projected[1 if thin == 2 else 2 if thin == 0 else 0][0]
            labels[part.no] = (sum(p[0] for p in face) / 4, sum(p[1] for p in face) / 4)
    for no, (cx, cy) in labels.items():
        cv.svg.add(El("circle", {"cx": cx, "cy": cy, "r": fs * 0.95, "class": "balloon"}),
                   text(cx, cy + fs * 0.36, no, font_size=fs * 1.05, class_="balloon-text"))
    return cv.markup()


# ---------- sheet layouts ----------

def sheet_drawing(sheet: Sheet, parts_by_no: dict[int, Part], uid: str = "sh") -> Markup:
    L, Wd = SHEET.length, SHEET.width
    fs = L / 46
    cv = Canvas(uid, -fs, -fs * 2.4, L + 2 * fs, Wd + fs * 3.6, fs)
    svg, board = cv.svg, sheet.board
    on = " on-dark" if is_dark(board.tint) else ""  # light labels on a dark board
    svg.add(rect(0, 0, L, Wd, "sheet", fill=cv.url("hatch")))
    for p in sheet.parts:
        part = parts_by_no[p.no]
        svg.add(rect(p.x, p.y, p.w, p.h, "part", fill=board.tint, fill_opacity=0.9))
        if part.grain:
            grain = El("g", {"class": "grain"})
            gy = p.y + 18
            while gy < p.y + p.h - 6:
                grain.add(El("line", {"x1": p.x + 6, "y1": gy, "x2": p.x + p.w - 6, "y2": gy}))
                gy += 26
            svg.add(grain)
        big = min(p.w, p.h) > fs * 2.2
        cx, cy = p.x + p.w / 2, p.y + p.h / 2
        svg.add(text(cx, cy + (-fs * 0.15 if big else fs * 0.35), p.no, font_size=fs * 1.2 if big else fs * 0.8, class_="part-no" + on))
        if big:
            a, b = (part.width, part.length) if p.rotated else (part.length, part.width)
            svg.add(text(cx, cy + fs * 1.05, f"{a}×{b}", font_size=fs * 0.7, class_="part-dim" + on, direction="ltr"))
    # RTL page: `start` is the right edge, `end` the left one.
    svg.add(text(L, -fs * 0.8, tr("{board} · {t} מ״מ · {size}", board=board.name, t=board.thickness, size=f"{LRI}{L}×{Wd}{PDI}"), font_size=fs * 0.9,
                 class_="sheet-title", text_anchor="start"),
            text(0, -fs * 0.8, tr("ניצולת {p}%", p=half_up(sheet.used * 100)), font_size=fs * 0.9, class_="sheet-title", text_anchor="end"))
    return cv.markup()


def edge_glyph(part: Part) -> Markup:
    """A tiny rectangle whose banded edges are drawn heavy."""
    e = part.edges
    svg = El("svg", {"xmlns": "http://www.w3.org/2000/svg", "viewBox": "0 0 30 16", "class": "edge-glyph", "aria-hidden": "true"},
             rect(2, 2, 26, 12, "eg-box"))
    for on, x1, y1, x2, y2 in ((e.l1, 2, 14, 28, 14), (e.l2, 2, 2, 28, 2), (e.w1, 2, 2, 2, 14), (e.w2, 28, 2, 28, 14)):
        if on:
            svg.add(line(x1, y1, x2, y2, "eg-on"))
    return Markup(str(svg))
