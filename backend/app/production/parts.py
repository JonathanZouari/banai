"""Cut list, hardware and edge banding of one design (port of production.js in the P2 prototype).

Pure: (design, catalog) -> Production, derived from the same layout as the advisories. One declared
construction method (`method`); every number is a draft for the carpenter to verify, never a
manufacturing approval. Part boxes are in body mm: x from the outer left face, y from the floor,
z from the back face (z = depth is the carcass front). Their `explode` vectors drive the exploded view.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field

from app.domain.defaults import SHOE_TIER
from app.domain.layout import SLIDE_OVERLAP, SLIDE_TRACK_DEPTH, Layout, layout
from app.production.boards import BACK_BOARD, DRAWER_BOARD, Board, board_for, handle_of, resolve
from app.production.nesting import SHEET

LRI, PDI = "\u2066", "\u2069"  # keep a run of numbers in order inside Hebrew text

BACK_T, BACK_GROOVE, BACK_INSERT = 5, 8, 7  # the back sits 7 mm into an 8 mm groove
BACK_Z = 3  # back face of the back panel, from the carcass back
INNER_Z = 13  # partitions and shelves start here, so the back runs behind them
PLINTH_SETBACK, PLINTH_FLOOR_GAP = 30, 4
DRAWER_SIDE = 16  # concealed runners need 11-16 mm sides [32]
RUNNERS = (250, 300, 350, 400, 450, 500)  # concealed runners come in 250-600 [32]; P2 used 500
RUNNER_CLEARANCE = 10  # box depth = runner - 10 [28], and as much free depth behind the box
DRAWER_INNER = 42  # inner box width = opening - 42 [28]
DRAWER_RECESS = 13  # bottom recess for the runners [28]
DRAWER_TOP_GAP = 64  # front height - side height (P2)
DRAWER_GAP = 3  # reveal between drawer fronts: a front is the drawer height - 3, centred
MIN_BOX_SIDE, MIN_BOX_INNER = 40, 100  # below this no standard box fits: front only, flagged
SHOE_SLOPE, SHOE_INSET, SHOE_RISE = 14, 50, 90  # degrees; shallower than a shelf; tier base to front edge
TIP_ON_LONG = 1300  # TIP-ON comes in a long version for doors above ~1300 mm [16]

GROUPS = ("גוף", "גב", "פנים", "חזיתות", "מגירות")


@dataclass(frozen=True)
class Edges:
    l1: bool = False  # the two long edges
    l2: bool = False
    w1: bool = False  # the two short edges
    w2: bool = False

    def mm(self, length: float, width: float) -> float:
        return (self.l1 + self.l2) * length + (self.w1 + self.w2) * width


FRONT_EDGE = Edges(l1=True)
ALL_EDGES = Edges(True, True, True, True)
NO_EDGES = Edges()


@dataclass(frozen=True)
class Box:
    min: tuple[float, float, float]
    max: tuple[float, float, float]
    explode: tuple[float, float, float]


def box(x0: float, y0: float, z0: float, x1: float, y1: float, z1: float,
        explode: tuple[float, float, float] = (0, 0, 0)) -> Box:
    return Box((x0, y0, z0), (x1, y1, z1), explode)


@dataclass
class Part:
    name: str
    group: str
    qty: int
    length: int  # along the grain in wood boards
    width: int
    board: Board
    edges: Edges = NO_EDGES
    note: str = ""
    boxes: list[Box] = field(default_factory=list)
    no: int = 0

    @property
    def thickness(self) -> int:
        return self.board.thickness

    @property
    def grain(self) -> bool:
        return self.board.grain


@dataclass(frozen=True)
class Hardware:
    name: str
    qty: int
    spec: str
    price: str | None = None  # a key of estimate.PRICE; None when the research has no price
    src: str = ""
    buy: bool = True  # False for machining that needs no purchase (a grip groove)


@dataclass
class Production:
    parts: list[Part]
    hardware: list[Hardware]
    edge_m: dict[str, int]  # board key -> metres of edge banding, +10%
    boards: dict[str, Board]  # every board, in first-use order
    method: list[str]
    anchors: int
    runner: int | None  # concealed runner length; None when none fits the depth
    partition_depth: int


def half_up(value: float) -> int:
    return math.floor(value + 0.5)


def nums(values: Iterable) -> str:
    """'1, 3' isolated as left-to-right text, for Hebrew notes."""
    return f"{LRI}{', '.join(str(v) for v in values)}{PDI}"


def comps_note(indices: Iterable[int]) -> str:
    ordered = sorted(set(indices))
    return f"{'תא' if len(ordered) == 1 else 'תאים'} {nums(i + 1 for i in ordered)}"


def partition_depth(lay: Layout) -> int:
    """Partitions start behind the back's path. With hinged doors they reach the carcass front, where the
    half-overlay hinges of both neighbouring doors mount; with sliding doors they stop behind the tracks."""
    front = lay.depth - SLIDE_TRACK_DEPTH if lay.sliding else lay.depth
    return front - INNER_Z


def runner_length(lay: Layout) -> int | None:
    """The longest standard runner whose box clears the back by RUNNER_CLEARANCE, behind an internal front
    at the shelf line."""
    room = lay.shelf_depth - lay.panel - (BACK_Z + BACK_T)
    return max((r for r in RUNNERS if r + RUNNER_CLEARANCE <= room), default=None)


def anchors_for(width: int) -> int:
    """At least 2 anchors up to 120 cm, and one more per 60 cm [103]."""
    return 2 + max(0, math.ceil((width - 1200) / 600))


def method(design: dict, lay: Layout) -> list[str]:
    plinth = (f"צוקל {lay.plinth} מ״מ בנסיגה של {PLINTH_SETBACK} מ״מ." if lay.plinth > PLINTH_FLOOR_GAP
              else "ללא צוקל: הדפנות והרצפה של הארון יושבות על רצפת החדר.")
    where = "מאחורי תחום המסילות" if lay.sliding else "עד קו החזית, כדי לשאת את הצירים"
    shelves = "מדפים מתכווננים על פינים בשיטת System 32."
    if any(c["rails"] for c in design["compartments"]):
        shelves += " מדף שמעל מוט תלייה קבוע."
    return [
        "דפנות לכל הגובה. תקרה ורצפה בין הדפנות.",
        f"גב {BACK_T} מ״מ בחריץ של {BACK_GROOVE} מ״מ, מפוצל מאחורי מחיצות.",
        plinth,
        f"מחיצות בין הרצפה לתקרה, {where}. חיבור בקונפירמט.",
        shelves,
        f"לוח {lay.panel} מ״מ ({LRI}{SHEET.length}×{SHEET.width}{PDI}). תיבות מגירה מלוח {DRAWER_SIDE} מ״מ.",
    ]


class _Rows:
    """Cut-list rows in order of first use. Rows with the same key merge their quantities and boxes."""

    def __init__(self) -> None:
        self.parts: list[Part] = []
        self._merged: dict[tuple, tuple[Part, set[int]]] = {}

    def add(self, part: Part) -> None:
        self.parts.append(part)

    def merge(self, key: tuple, make: Callable[[], Part], *, comp: int | None = None, boxes: Iterable[Box] = (),
              qty: int = 1, suffix: str = "") -> None:
        """Add `qty` to the row of `key` (made by `make()` on first use). With `comp`, the note lists the
        compartments, followed by `suffix`."""
        if key not in self._merged:
            part = make()
            part.qty = 0
            self.add(part)
            self._merged[key] = (part, set())
        part, comps = self._merged[key]
        part.qty += qty
        part.boxes.extend(boxes)
        if comp is not None:
            comps.add(comp)
        part.note = " · ".join(x for x in (comps_note(comps) if comps else "", suffix) if x)


def production(design: dict, catalog: dict) -> Production:
    lay = layout(design)
    P, W, H, D = lay.panel, lay.width, lay.height, lay.depth
    comps, partitions = design["compartments"], design["partitions"]
    carcass_app = design["carcass"]["appearance"]
    body = board_for(carcass_app, P, catalog)
    floor = lay.floor_y(0)
    rows = _Rows()

    # Carcass.
    rows.add(Part("דופן", "גוף", 2, H, D, body, FRONT_EDGE,
                  boxes=[box(0, 0, 0, P, H, D, (-1, 0, 0)), box(W - P, 0, 0, W, H, D, (1, 0, 0))]))
    rows.add(Part("תקרה", "גוף", 1, W - 2 * P, D, body, FRONT_EDGE, boxes=[box(P, H - P, 0, W - P, H, D, (0, 1, 0))]))
    rows.add(Part("רצפה", "גוף", 1, W - 2 * P, D, body, FRONT_EDGE,
                  boxes=[box(P, lay.plinth, 0, W - P, lay.plinth + P, D, (0, -0.25, 0))]))
    has_plinth = lay.plinth > PLINTH_FLOOR_GAP
    if has_plinth:
        z, h = D - PLINTH_SETBACK, lay.plinth - PLINTH_FLOOR_GAP
        rows.add(Part("צוקל", "גוף", 1, W - 2 * P, h, body, boxes=[box(P, 0, z - P, W - P, h, z, (0, -1.9, 1.0))]))
    part_d = partition_depth(lay)
    for i, prt in enumerate(partitions):
        x, t = lay.ranges[i][1], prt["thickness"]
        rows.merge(("partition", t),
                   lambda t=t: Part("מחיצה", "גוף", 0, lay.interior_height, part_d, board_for(carcass_app, t, catalog), FRONT_EDGE),
                   boxes=[box(x, floor, INNER_Z, x + t, H - P, INNER_Z + part_d)])

    # Backs: split behind partitions so no piece is wider than a sheet allows. Each piece runs from a side
    # groove (or a joint) to the centre of a partition, where the joint is hidden.
    back_h = lay.interior_height + 2 * BACK_INSERT
    groups: list[dict] = []
    for i, (_, x1) in enumerate(lay.ranges):
        end = W - P + BACK_INSERT if i == len(comps) - 1 else x1 + partitions[i]["thickness"] / 2
        last = groups[-1] if groups else None
        if last and end - last["xa"] <= SHEET.width - 2 * SHEET.trim:
            last["xb"] = end
            last["comps"].append(i)
        else:
            groups.append({"xa": last["xb"] if last else P - BACK_INSERT, "xb": end, "comps": [i]})
    by_width: dict[int, list[dict]] = {}
    for g in groups:
        by_width.setdefault(half_up(g["xb"] - g["xa"]), []).append(g)
    for width, gs in by_width.items():
        spans = [f"{g['comps'][0] + 1}" + (f"–{g['comps'][-1] + 1}" if len(g["comps"]) > 1 else "") for g in gs]
        many = len(gs) > 1 or len(gs[0]["comps"]) > 1
        rows.add(Part("גב", "גב", len(gs), back_h, width, BACK_BOARD, note=f"מאחורי {'תאים' if many else 'תא'} {nums(spans)}",
                      boxes=[box(g["xa"], floor - BACK_INSERT, BACK_Z, g["xb"], floor - BACK_INSERT + back_h, BACK_Z + BACK_T,
                                 (0, 0, -1.3)) for g in gs]))

    # Shelves, merged when sizes and boards match.
    shelf_d = lay.shelf_depth - INNER_Z
    for i, c in enumerate(comps):
        x0, x1 = lay.ranges[i]
        for s in c["shelves"]:
            b, y = board_for(resolve(s["appearance"], carcass_app), s["thickness"], catalog), lay.floor_y(s["y"])
            rows.merge(("shelf", x1 - x0 - 2, b.key), lambda b=b, w=x1 - x0 - 2: Part("מדף", "פנים", 0, w, shelf_d, b, FRONT_EDGE),
                       comp=i, boxes=[box(x0 + 1, y, INNER_Z, x1 - 1, y + s["thickness"], INNER_Z + shelf_d, (0, 0, 0.9))])

    # Fronts.
    items, door_app = design["doors"]["items"], design["doors"]["appearance"]
    for door, d in zip(items, lay.doors, strict=True):
        b, w = board_for(resolve(door["appearance"], door_app), P, catalog), half_up(d.width)
        mirror_note = "מראה 4 מ״מ מודבקת, עם גיבוי בטיחות"
        if d.hinge:
            name, z0 = ("דלת מראה" if d.mirror else "דלת"), D + 1
            note = " · ".join([f"{d.hinges} צירים"] + ([mirror_note] if d.mirror else []))
        else:
            name, z0 = ("כנף הזזה עם מראה" if d.mirror else "כנף הזזה"), D - (30 if d.track == "front" else 60)
            note = ", ".join(([f"חפיפה {SLIDE_OVERLAP} מ״מ"] if len(items) > 1 else []) + ([mirror_note] if d.mirror else []))
        rows.merge(("front", name, w, d.height, b.key, note),
                   lambda name=name, w=w, h=d.height, b=b: Part(name, "חזיתות", 0, h, w, b, ALL_EDGES),
                   boxes=[box(d.x0, d.y0, z0, d.x0 + d.width, d.y0 + d.height, z0 + P, (0, 0, 3.6))], suffix=note)

    # Drawers: an internal front at the shelf line, on concealed runners. Box parts are a fixed white board.
    runner = runner_length(lay)
    box_d = runner - RUNNER_CLEARANCE if runner else 0
    boxed: list[dict] = []
    for i, c in enumerate(comps):
        x0, x1 = lay.ranges[i]
        for dr in c["drawers"]:
            fh = dr["height"] - DRAWER_GAP
            side_h, inner = fh - DRAWER_TOP_GAP, x1 - x0 - DRAWER_INNER
            ok = runner is not None and side_h >= MIN_BOX_SIDE and inner >= MIN_BOX_INNER
            b, y = board_for(resolve(dr["appearance"], carcass_app), P, catalog), lay.floor_y(dr["y"]) + DRAWER_GAP / 2
            rows.merge(("drawer-front", x1 - x0 - 4, fh, b.key, ok),
                       lambda w=x1 - x0 - 4, fh=fh, b=b: Part("חזית מגירה", "מגירות", 0, w, fh, b, ALL_EDGES), comp=i,
                       boxes=[box(x0 + 2, y, lay.shelf_depth - box_d - P, x1 - 2, y + fh, lay.shelf_depth, (0, 0, 2.0))],
                       suffix="" if ok else "בלי תיבה: קטנה מדי לתיבה על מסילה סמויה, לתכנון ידני")
            if not ok:
                continue
            boxed.append(dr)
            for name, qty, length, width, edges in (
                ("דופן מגירה", 2, box_d, side_h, FRONT_EDGE),
                ("גב וחזית פנימית", 2, inner, side_h - DRAWER_RECESS, FRONT_EDGE),
                ("תחתית מגירה", 1, inner, box_d - 2 * DRAWER_SIDE, NO_EDGES),
            ):
                rows.merge((name, length, width),
                           lambda n=name, ln=length, wd=width, e=edges: Part(n, "מגירות", 0, ln, wd, DRAWER_BOARD, e),
                           comp=i, qty=qty)

    # Interior inserts that are board parts: sloped shoe shelves. The others are hardware.
    for i, c in enumerate(comps):
        x0, x1 = lay.ranges[i]
        for ins in (x for x in c["inserts"] if x["type"] == "shoes"):
            ys = [lay.floor_y(ins["y"] + k * SHOE_TIER) + SHOE_RISE for k in range(ins["tiers"])]
            z0 = INNER_Z + 25
            rows.merge(("shoes", x1 - x0 - 2),
                       lambda w=x1 - x0 - 2: Part("מדף נעליים משופע", "פנים", 0, w, shelf_d - SHOE_INSET, body, FRONT_EDGE),
                       comp=i, qty=ins["tiers"], suffix=f"שיפוע {SHOE_SLOPE}°",
                       boxes=[box(x0 + 1, y, z0, x1 - 1, y + P, z0 + shelf_d - SHOE_INSET, (0, 0, 0.9)) for y in ys])

    parts = rows.parts
    for no, part in enumerate(parts, 1):
        part.no = no
    boards: dict[str, Board] = {}
    edge_m: dict[str, float] = {}
    for part in parts:
        boards.setdefault(part.board.key, part.board)
        mm = part.edges.mm(part.length, part.width)
        if mm and part.board.edging:
            edge_m[part.board.key] = edge_m.get(part.board.key, 0) + mm * part.qty / 1000
    edges = {k: math.ceil(round(v * 1.1, 6)) for k, v in edge_m.items()}  # +10% allowance
    hardware = _hardware(design, lay, parts, runner, boxed, has_plinth)
    return Production(parts, hardware, edges, boards, method(design, lay), anchors_for(W), runner, part_d)


HANDLES = {  # style -> (name, spec); `none` is push-to-open, `groove` is machined
    "bar": ("ידית מוט", "מרכזים 320 מ״מ, למגירות 128 מ״מ"),
    "knob": ("כפתור", "בורג אחד"),
    "edge": ("פרופיל ידית", "לאורך הדלת, ולמגירות לרוחב החזית"),
    "cup": ("ידית שקועה", "כרסום בחזית לפי תבנית היצרן"),
}
HANDLE_FINISHES = {"steel": "נירוסטה", "black": "שחור", "brass": "פליז"}


def _hardware(design: dict, lay: Layout, parts: list[Part], runner: int | None, boxed: list[dict],
              has_plinth: bool) -> list[Hardware]:
    hw: list[Hardware] = []

    def add(name: str, qty: int, spec: str, price: str | None = None, src: str = "", buy: bool = True) -> None:
        if qty > 0:
            hw.append(Hardware(name, qty, spec, price, src, buy))

    comps, items = design["compartments"], design["doors"]["items"]
    if design["doors"]["type"] == "hinged":
        hinges = {(a, p): 0 for a in (110, 155) for p in (False, True)}
        push_doors = long_push = 0
        for door, d in zip(items, lay.doors, strict=True):
            push = handle_of(door, design)["style"] == "none"
            # A door in front of drawers needs a zero-protrusion hinge, or the drawer hits it (R10).
            hinges[(155 if any(comps[i]["drawers"] for i in d.compartments) else 110, push)] += d.hinges
            push_doors += push
            long_push += push and d.height > TIP_ON_LONG
        add("ציר סמוי 110° עם טריקה שקטה", hinges[(110, False)], "כוס Ø35, עם פלטה", "hinge110", "[2][77]")
        add("ציר סמוי 155° ללא בליטה", hinges[(155, False)], "לדלתות מול מגירות (R10)", "hinge155", "[37][77]")
        add("ציר סמוי 110° ללא קפיץ", hinges[(110, True)], "לפתיחה בלחיצה, כוס Ø35, עם פלטה", None, "[2][16]")
        add("ציר סמוי 155° ללא בליטה וללא קפיץ", hinges[(155, True)], "לדלתות מול מגירות, לפתיחה בלחיצה", None, "[16][37]")
        add("מנגנון פתיחה בלחיצה לדלת", push_doors,
            "עם ציר ללא קפיץ" + (f", גרסה ארוכה לדלת מעל {TIP_ON_LONG} מ״מ" if long_push else ""), None, "[16]")
    if lay.sliding and lay.doors:
        add("ערכת מסילות הזזה עליונה ותחתונה", 1, f"{len(lay.doors)} כנפיים, עד 50 ק״ג לכנף", "slideKit", "[10][78]")
    if runner:
        push = sum(handle_of(dr, design)["style"] == "none" for dr in boxed)
        spec = f"זוג באורך {runner} מ״מ, דפנות 11–16 מ״מ"
        add("מסילות מגירה סמויות, טריקה שקטה", len(boxed) - push, spec, None, "[28][32]")
        add("מסילות מגירה סמויות, פתיחה בלחיצה", push, spec, None, "[32][33]")
    rails = [lay.ranges[i][1] - lay.ranges[i][0] for i, c in enumerate(comps) for _ in c["rails"]]
    add("מוט תלייה Ø25", len(rails), "חיתוך לפי רוחב התא", "rail", "[41][79]")
    add("תומך מוט (שושנה)", sum(2 + (w > 800) for w in rails), "כולל תמיכה אמצעית מעל 80 ס״מ", None, "[41]")
    fronts = list(items) + [dr for c in comps for dr in c["drawers"]]
    handles: dict[tuple[str, str], int] = {}
    for item in fronts:
        h = handle_of(item, design)
        handles[(h["style"], h["finish"])] = handles.get((h["style"], h["finish"]), 0) + 1
    for (style, finish), qty in handles.items():
        if style in HANDLES:
            add(f"{HANDLES[style][0]} · {HANDLE_FINISHES[finish]}", qty, HANDLES[style][1])
        elif style == "groove":
            add("חריץ אחיזה", qty, "כרסום בחזית, בלי פריט לרכישה", buy=False)
    add("פין מדף", 4 * sum(p.qty for p in parts if p.name == "מדף"), "Ø5, System 32", None, "[27]")
    inserts = [(i, x) for i, c in enumerate(comps) for x in c["inserts"]]
    add("מתקן תלייה נשלף (פנטוגרף)", sum(x["type"] == "pulldown" for _, x in inserts), "רוחב 83–115 ס״מ, עד 10 ק״ג",
        "pulldown", "[43]")
    add("מתקן מכנסיים נשלף", sum(x["type"] == "trousers" for _, x in inserts), "מסילות שליפה מתחת למדף, 10–14 מוטות")
    add("מוט חזית למדף נעליים", sum(x["tiers"] for _, x in inserts if x["type"] == "shoes"), "Ø10, חיתוך לפי רוחב התא")
    lit = [lay.ranges[i][1] - lay.ranges[i][0] for i, x in inserts if x["type"] == "led"]
    add("פס LED עם חיישן דלת", len(lit), f"{sum(w - 40 for w in lit) / 1000:.1f} מ׳ בסך הכול, ספק 12V מוסתר", None, "§6")
    add("זווית עיגון מגולוונת", anchors_for(lay.width), "לשלד הקיר, לא לגב. בורג 8 מ״מ ודיבל לפי סוג הקיר", "anchor",
        "[103]")
    joints = 4 + 2 * len(design["partitions"]) + (2 if has_plinth else 0)
    add("בורג קונפירמט (אומדן)", joints * 3, "3 לכל חיבור")
    return hw
