"""Advisory layer: research-backed, non-blocking guidance on a canonical design (R1-R19).

Pure: (design, catalog) -> advisories. Every item carries its evidence grade and its source in
docs/research/carpentry-wardrobes-research.md, so the app explains why instead of claiming a design
is "approved". A quick fix is a list of ops that was dry-run against the design: a fix the engine
would reject is never offered. ADR-018: this is the only implementation (no JS mirror).

Texts are Hebrew, for the RTL workspace. Ids are stable per rule (and per compartment where a rule
fires per compartment), so the client can keep a dismissed advisory dismissed.
"""

from __future__ import annotations

import math

from app.domain.apply import apply_ops
from app.domain.defaults import SHOE_TIER
from app.domain.errors import DomainError
from app.domain.layout import SLIDE_OVERLAP, SLIDE_TRACK_DEPTH, Layout, layout

LEVEL_ORDER = {"critical": 0, "warn": 1, "info": 2}
HANG_DEPTH = 580  # minimum depth for hangers [39]
PULLDOWN_WIDTH = (830, 1150)  # pull-down rails on the market [43]
MAX_SHELF_SPAN = 800  # 17 mm melamine, folded clothes [22][25]
RAIL_SUPPORT_SPAN, MAX_RAIL_SPAN = 800, 1000  # 25 mm round rail [41]
MAX_HINGED_WIDTH, MAX_HINGED_WIDTH_EXTRA = 600, 650  # concealed hinges [3]
HEAVY_DOOR_KG = 27.2  # top of the hinge weight tables [3][5]
DRAWER_SIDE_CLEARANCE = 5  # box = compartment - 10: inner width - 42 with 16 mm sides [28][32]


def cm(mm: float) -> str:
    value = round(mm) / 10
    return str(int(value)) if value == int(value) else f"{value:.1f}"


def _tag(component_id: str, size: int) -> str:
    """A component id without its prefix, cut so a derived id stays within the 40-char suffix limit."""
    return component_id.split("_", 1)[1][:size]


class _Collector:
    def __init__(self, design: dict, catalog: dict | None) -> None:
        self.design, self.catalog, self.items = design, catalog, []

    def fix(self, label: str, ops: list[dict]) -> dict | None:
        try:
            apply_ops(self.design, ops, self.catalog)  # dry run: never offer a fix the engine rejects
        except DomainError:
            return None
        return {"label": label, "ops": ops}

    def add(self, id_: str, level: str, title: str, body: str, grade: str, src: str, targets: list[str],
            fix: dict | None = None) -> None:
        item = {"id": id_, "level": level, "title": title, "body": body, "grade": grade, "src": src, "targets": targets}
        if fix:
            item["fix"] = fix
        self.items.append(item)


def advisories(design: dict, catalog: dict | None) -> list[dict]:
    """All advisories for a canonical, already validated design, most severe first (stable within a level)."""
    out = _Collector(design, catalog)
    lay = layout(design)
    for rule in (_site, _hinged_doors, _sliding_doors, _drawers, _spans, _inserts, _hanging, _board):
        rule(design, lay, out)
    return sorted(out.items, key=lambda a: LEVEL_ORDER[a["level"]])


def _site(design: dict, lay: Layout, out: _Collector) -> None:
    site = design["site"] or {}
    ceiling, niche = site.get("ceiling"), site.get("niche")
    # R1: a carcass assembled lying down pivots on its back-bottom corner when it is raised [97].
    if ceiling:
        diagonal = math.hypot(lay.height, lay.depth)
        max_height = int(math.sqrt(max(0, (ceiling - 10) ** 2 - lay.depth ** 2)) // 10 * 10)
        lower = out.fix(f"הנמך ל-{cm(max_height)} ס״מ", [{"op": "update_dimensions", "height": max_height}])
        if lay.height > ceiling:
            out.add("r1-over", "critical", "הארון גבוה מהתקרה",
                    f"גובה {cm(lay.height)} ס״מ מול תקרה של {cm(ceiling)} ס״מ.", "מדידה", "סעיף 5.1", ["carcass"], lower)
        elif diagonal + 10 > ceiling:
            out.add("r1-lift", "warn", "הגוף לא יתרומם לעמידה",
                    f"גוף שהורכב בשכיבה מסתובב סביב הפינה האחורית: האלכסון {cm(diagonal)} ס״מ, והתקרה {cm(ceiling)} ס״מ. "
                    f"הגובה המרבי הוא {cm(max_height)} ס״מ, ואת ההפרש סוגרים בפילר עליון.", "הערכה", "[97]",
                    ["carcass"], lower)
        elif ceiling - lay.height > 60:
            out.add("r1-gap", "info", f"{cm(ceiling - lay.height)} ס״מ עד התקרה",
                    "מקובל לסגור את המרווח בפילר עליון או בכרכוב, אחרי שהגוף הורם למקום.", "כלל אצבע", "[97]", ["carcass"])
    # R12: niche fit and fillers [38][96].
    if niche:
        gap = niche - lay.width
        narrower = out.fix(f"התאם ל-{cm(niche - 50)} ס״מ", [{"op": "update_dimensions", "width": niche - 50}])
        if gap < 0:
            out.add("niche-over", "critical", "הארון רחב מהנישה",
                    f"{cm(lay.width)} ס״מ מול נישה של {cm(niche)} ס״מ (הרוחב הקטן מבין שלוש המדידות).", "מדידה",
                    "סעיף 5.1", ["carcass"], narrower)
        elif design["doors"]["type"] == "hinged" and gap < 40:
            out.add("r12-filler", "warn", "דלת ציר צמודה לקיר",
                    "דלת ציר ליד קיר צריכה פילר, כדי להיפתח מעבר ל-90° בלי לשפשף את הקיר. מומלץ לפחות 2 ס״מ בכל צד.",
                    "כלל אצבע", "[38][96]", ["carcass"], narrower)
        elif 40 <= gap <= 300:
            out.add("r12-gap", "info", f"פילר {cm(gap / 2)} ס״מ בכל צד",
                    "הפילרים סוגרים את הנישה ומשמשים מרווח לפתיחת הדלתות. הנגר מכייל אותם במדידה באתר.",
                    "כלל אצבע", "[96]", ["carcass"])


def _hinged_doors(design: dict, lay: Layout, out: _Collector) -> None:
    """R3 door width, R4 hinge count, R6 mirror weight and safety [3][5][13][17][21]."""
    if lay.doors and design["doors"]["type"] == "hinged":
        wide = [d for d in lay.doors if d.width > MAX_HINGED_WIDTH]
        if wide:
            worst = max(d.width for d in wide)
            lone = [d for d in wide if d.compartment is not None
                    and sum(1 for x in lay.doors if x.compartment == d.compartment) == 1]
            split = out.fix("פצל לשתי דלתות", [{"op": "split_door", "id": d.id, "newId": f"dr_{_tag(d.id, 30)}_2"}
                                                for d in lone]) if lone else None
            count = "דלת אחת" if len(wide) == 1 else f"{len(wide)} דלתות"
            out.add("r3-wide", "warn" if worst > MAX_HINGED_WIDTH_EXTRA else "info", "דלת רחבה מדי לציר סמוי",
                    f"{count} ברוחב עד {cm(worst)} ס״מ. צירים סמויים מוגדרים עד 60 ס״מ, ו-65 עם ציר נוסף.", "יצרן", "[3]",
                    [f"door:{d.id}" for d in wide], split)
        mirror = next((d for d in lay.doors if d.mirror), None)
        plain = next((d for d in lay.doors if not d.mirror), lay.doors[0])
        if mirror and mirror.kg > HEAVY_DOOR_KG:
            count = 2 if lay.width <= 2000 else 3
            to_sliding = out.fix("עבור לדלתות הזזה", [{"op": "configure_doors", "type": "sliding",
                                                       "ids": [f"dr_s{i + 1}" for i in range(count)]}])
            out.add("r6-mirror", "warn", "דלת מראה כבדה לציר",
                    f"מראה של 4 מ״מ על לוח מוסיפה כ-10 ק״ג למ״ר. הדלת שוקלת כ-{round(mirror.kg)} ק״ג, מעבר לטבלאות "
                    "הצירים. בדלת כזו עדיפה הזזה במסילה של 50–100 ק״ג.", "הערכה", "[17][13]", [f"door:{mirror.id}"],
                    to_sliding)
        out.add("r4-hinges", "info", f"{plain.hinges} צירים לכל דלת",
                f"דלת {cm(plain.height)} ס״מ, כ-{round(plain.kg)} ק״ג. המספר נקבע לפי הגובה ולפי המשקל, הגבוה מביניהם."
                + (f" לדלת המראה: {mirror.hinges}." if mirror and mirror is not plain else ""), "יצרן", "[3][5]",
                [f"door:{d.id}" for d in lay.doors])
    if any(d.mirror for d in lay.doors):
        out.add("r6-safety", "info", "מראה עם גיבוי בטיחות",
                "מראה בדלת ארון מגובה ביריעת בטיחות (סיווג EN 12600), כדי שלא תתנפץ לרסיסים.", "תקן", "[21]",
                [f"door:{d.id}" for d in lay.doors if d.mirror])


def _sliding_doors(design: dict, lay: Layout, out: _Collector) -> None:
    """R5 depth and access, R10 drawers behind the overlap [11][13][14][15][38][39]."""
    comps = design["compartments"]
    if lay.sliding and lay.doors:
        usable = lay.depth - SLIDE_TRACK_DEPTH - lay.panel
        hanging = [i for i, c in enumerate(comps) if c["rails"] or any(x["type"] == "pulldown" for x in c["inserts"])]
        if hanging and usable < HANG_DEPTH:
            depth = HANG_DEPTH + SLIDE_TRACK_DEPTH + lay.panel + 3
            out.add("r5-depth", "warn", "אין מספיק עומק לתלייה",
                    f"המסילות תופסות 8–10 ס״מ מהעומק. נשארים כ-{cm(usable)} ס״מ, ותלייה צריכה {cm(HANG_DEPTH)} לפחות.",
                    "יצרן", "[11][15][39]", [f"comp:{i}" for i in hanging],
                    out.fix(f"הגדל עומק ל-{cm(depth)} ס״מ", [{"op": "update_dimensions", "depth": depth}]))
        count = len(lay.doors)
        if count > 1:
            share = "שליש" if count == 3 else "חצי" if count == 2 else f"1/{count}"
            out.add("r5-open", "info", f"{count} דלתות הזזה בחפיפה של 2 ס״מ",
                    f"בכל רגע פתוח לכל היותר {share} מרוחב הארון.", "חישוב", "[13][14]", [f"door:{d.id}" for d in lay.doors])
        overlaps = [(d.x0, d.x0 + SLIDE_OVERLAP) for d in lay.doors[1:]]
        def box_hits(i: int) -> bool:  # the drawer box, not the compartment: the overlap sits over a partition
            x0, x1 = lay.ranges[i][0] + DRAWER_SIDE_CLEARANCE, lay.ranges[i][1] - DRAWER_SIDE_CLEARANCE
            return any(a < x1 and b > x0 for a, b in overlaps)

        blocked = [i for i, c in enumerate(comps) if c["drawers"] and box_hits(i)]
        if blocked:
            out.add("r10-slide", "warn", "מגירות בתחום החפיפה",
                    "מאחורי דלתות הזזה, מגירה חייבת לשבת בתוך הפתח של דלת אחת ומחוץ לחפיפה. אחרת הדלת חוסמת אותה.",
                    "יצרן", "[38][15]", [f"comp:{i}" for i in blocked])
    elif design["doors"]["type"] == "hinged" and any(c["drawers"] for c in comps):
        out.add("r10-hinge", "info", "מגירות מאחורי דלת ציר",
                "כדי שהמגירה לא תתנגש בציר, מוסיפים ספייסר של עד 25 מ״מ בכל צד, או ציר 155° ללא בליטה.",
                "יצרן", "[36][37]", [f"comp:{i}" for i, c in enumerate(comps) if c["drawers"]])


def _drawers(design: dict, lay: Layout, out: _Collector) -> None:
    """R11: concealed runners need 11-16 mm drawer sides [28][32]."""
    with_drawers = [i for i, c in enumerate(design["compartments"]) if c["drawers"]]
    if with_drawers:
        out.add("r11-runner", "info", "תיבות מגירה מלוח 16 מ״מ",
                "מסילות סמויות דורשות דפנות מגירה של 11–16 מ״מ, ולכן לוח 17 לא מתאים. מתכננים תיבה מלוח 16, "
                "או מערכת עם דפנות מתכת. רוחב פנימי = רוחב התא פחות 42 מ״מ.", "יצרן", "[28][32]",
                [f"comp:{i}" for i in with_drawers])


def _spans(design: dict, lay: Layout, out: _Collector) -> None:
    """R7 shelf span [22][25], R8 rail span [41]. The fix splits the compartment in the middle."""
    comps = design["compartments"]

    def split(i: int) -> dict | None:
        c = comps[i]
        tag = _tag(c["id"], 30)
        return out.fix("חלק את התא", [{"op": "add_partition", "compartmentId": c["id"], "offset": (c["width"] - lay.panel) // 2,
                                       "id": f"prt_{tag}_s", "newCompartmentId": f"cmp_{tag}_s"}])

    long_shelves = [i for i, c in enumerate(comps) if c["shelves"] and c["width"] > MAX_SHELF_SPAN]
    if long_shelves:
        out.add("r7-sag", "warn", "מדף ארוך עלול לשקוע",
                f"מדף של {cm(max(comps[i]['width'] for i in long_shelves))} ס״מ במלמין 17 מ״מ: עד כ-80 ס״מ לבגדים "
                "מקופלים, וכ-60 לספרים. זחילה לאורך זמן מקצרת עוד.", "הערכה", "[22][25]",
                [f"comp:{i}" for i in long_shelves], split(long_shelves[0]))
    long_rails = [i for i, c in enumerate(comps) if c["rails"] and c["width"] > RAIL_SUPPORT_SPAN]
    if long_rails:
        worst = max(comps[i]["width"] for i in long_rails)
        too_long = worst > MAX_RAIL_SPAN
        out.add("r8-rail", "warn" if too_long else "info", "מוט תלייה ארוך מדי" if too_long else "למוט נדרשת תמיכה אמצעית",
                f"מוט עגול 25 מ״מ: מ-80 ס״מ צריך תמיכה באמצע, ולא יותר מ-100 ס״מ בסך הכול. כאן {cm(worst)} ס״מ.",
                "יצרן", "[41]", [f"comp:{i}" for i in long_rails],
                split(next(i for i in long_rails if comps[i]["width"] == worst)) if too_long else None)


def _inserts(design: dict, lay: Layout, out: _Collector) -> None:
    """R16 pull-down, R17 shoes, R18 trousers [35][39][43][44], R19 LED and the electrical point (§6)."""
    comps = design["compartments"]
    for i, c in enumerate(comps):
        n = i + 1
        pulldown = next((x for x in c["inserts"] if x["type"] == "pulldown"), None)
        high = next((r for r in sorted(c["rails"], key=lambda r: -r["y"]) if lay.floor_y(r["y"]) > 1900), None)
        fits = PULLDOWN_WIDTH[0] <= c["width"] <= PULLDOWN_WIDTH[1]
        if high and not pulldown:
            swap = out.fix("החלף במתקן נשלף", [
                {"op": "remove_component", "id": high["id"]},
                {"op": "add_insert", "compartmentId": c["id"], "type": "pulldown", "y": high["y"],
                 "id": f"ins_{_tag(c['id'], 30)}_p"},
            ]) if fits else None
            out.add(f"r16-high-{i}", "info", f"מוט גבוה בתא {n}",
                    f"המוט בגובה {cm(lay.floor_y(high['y']))} ס״מ מהרצפה. מעל כ-190 ס״מ נוח יותר מתקן תלייה נשלף."
                    + ("" if fits else f" המתקנים בשוק ברוחב 83–115 ס״מ, והתא ברוחב {cm(c['width'])}."),
                    "הערכה", "[43][44]", [f"comp:{i}"], swap)
        if pulldown and not fits:
            out.add(f"r16-width-{i}", "warn", f"מתקן נשלף לא בגודל התא {n}",
                    f"מתקני תלייה נשלפים מיוצרים ברוחב 83–115 ס״מ, והתא ברוחב {cm(c['width'])}. "
                    "משנים את רוחב התא או מוותרים על המתקן.", "יצרן", "[43]", [f"comp:{i}"],
                    out.fix("הסר את המתקן", [{"op": "remove_component", "id": pulldown["id"]}]))
        for x in c["inserts"]:
            if x["type"] == "shoes":
                pairs = x["tiers"] * (c["width"] // 220)
                out.add(f"r17-shoes-{i}", "warn" if lay.shelf_depth < 350 else "info", f"{pairs} זוגות נעליים בתא {n}",
                        f"{x['tiers']} קומות משופעות בגובה {cm(SHOE_TIER)} ס״מ, בעומק {cm(lay.shelf_depth)}. "
                        "מקובל: 22–26 ס״מ לקומה ו-35 ס״מ עומק לפחות.", "כלל אצבע", "[35]", [f"comp:{i}"])
            elif x["type"] == "trousers":
                narrow = c["width"] < 450
                out.add(f"r18-trousers-{i}", "warn" if narrow else "info", f"מתקן מכנסיים בתא {n}",
                        f"נשלף עד גובה {cm(lay.floor_y(x['y'] + x['height']))} ס״מ. מכנסיים מקופלים על מוט צריכים 60–70 ס״מ."
                        + (" התא צר מדי למתקן סטנדרטי." if narrow else ""), "יצרן", "[39]", [f"comp:{i}"])
    lit = [i for i, c in enumerate(comps) if any(x["type"] == "led" for x in c["inserts"])]
    if lit:
        out.add("r19-led", "info", "תאורת LED " + ("בתא אחד" if len(lit) == 1 else f"ב-{len(lit)} תאים"),
                "נדלקת בפתיחת הדלת (חיישן). צריך נקודת חשמל בנישה או ספק 12V מוסתר. מתאמים עם חשמלאי לפני הייצור.",
                "צ׳קליסט", "§6", [f"comp:{i}" for i in lit])


def _hanging(design: dict, lay: Layout, out: _Collector) -> None:
    """R9: each hanging zone, from a rail down to the nearest item below it [35][39][40]."""
    for i, c in enumerate(design["compartments"]):
        tops = [s["y"] + s["thickness"] for s in c["shelves"]] + [d["y"] + d["height"] for d in c["drawers"]]
        tops += [x["y"] + (x["tiers"] * SHOE_TIER if x["type"] == "shoes" else x["height"])
                 for x in c["inserts"] if x["type"] in ("shoes", "trousers")]
        zones = [r["y"] - max((t for t in tops if t <= r["y"]), default=0) for r in c["rails"]]
        if not zones:
            continue
        shortest = min(zones)
        if shortest < 900:
            out.add(f"r9-short-{i}", "warn", f"אזור תלייה קצר בתא {i + 1}",
                    f"באזור הקצר יש {cm(shortest)} ס״מ. חולצה תלויה צריכה כ-80 ס״מ ועוד קולב, כלומר כ-90.",
                    "כלל אצבע", "[35][39][40]", [f"comp:{i}"])
        elif len(zones) == 1 and shortest < 1400:
            out.add(f"r9-long-{i}", "info", f"תלייה לחולצות בתא {i + 1}",
                    f"יש {cm(shortest)} ס״מ מתחת למוט: מספיק לחולצות, לא למעילים (כ-100 ס״מ) ולשמלות ארוכות (עד 190).",
                    "כלל אצבע", "[35][39]", [f"comp:{i}"])


def _board(design: dict, lay: Layout, out: _Collector) -> None:
    """R2: board thickness against the Israeli market [59]-[62]."""
    if lay.panel == 17:
        out.add("r2-board", "info", "לוח 17 מ״מ",
                "המלמין הסטנדרטי בישראל הוא 17 מ״מ, בלוחות של 244×122 ס״מ. כל המידות בתכנון מחושבות לפי 17.",
                "ספק", "[59]–[62]", ["carcass"])
    else:
        out.add("r2-board", "info", f"לוח {lay.panel} מ״מ",
                f"בישראל המלמין הסטנדרטי הוא 17 מ״מ (ו-28 כעבה). לוח {lay.panel} מ״מ לא תמיד במלאי. "
                "בודקים מול הספק לפני הייצור.", "ספק", "[59]–[62]", ["carcass"])
