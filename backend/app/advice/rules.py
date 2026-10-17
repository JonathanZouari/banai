"""Advisory layer: research-backed, non-blocking guidance on a canonical design (R1-R20).

Pure: (design, catalog) -> advisories. Every item carries its evidence grade and its source in
docs/research/carpentry-wardrobes-research.md, so the app explains why instead of claiming a design
is "approved". A quick fix is a list of ops that was dry-run against the design: a fix the engine
would reject is never offered. ADR-018: this is the only implementation (no JS mirror).

Texts are Hebrew, for the RTL workspace, and go through tr(): inside `with language(...)` (the dossier)
they come out in that language (app/i18n.py). Ids are stable per rule (and per compartment where a rule
fires per compartment), so the client can keep a dismissed advisory dismissed.
"""

from __future__ import annotations

import math

from app.domain.apply import apply_ops
from app.domain.defaults import SHOE_TIER
from app.domain.errors import DomainError
from app.domain.layout import SLIDE_OVERLAP, SLIDE_TRACK_DEPTH, Layout, layout
from app.i18n import tr

LEVEL_ORDER = {"critical": 0, "warn": 1, "info": 2}
HANG_DEPTH = 580  # minimum depth for hangers [39]
PULLDOWN_WIDTH = (830, 1150)  # pull-down rails on the market [43]
MAX_SHELF_SPAN = 800  # 17 mm melamine, folded clothes [22][25]
MAX_FIXED_SHELF_SPAN = 1000  # 800-1000 mm: 25 mm board, a front strip or fixed ends [26]; above that, split
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


def _ids(design: dict) -> set[str]:
    """Every component id in the design."""
    found = {p["id"] for p in design["partitions"]} | {d["id"] for d in design["doors"]["items"]}
    for c in design["compartments"]:
        found.add(c["id"])
        for kind in ("shelves", "drawers", "rails", "inserts"):
            found |= {item["id"] for item in c[kind]}
    return found


def _free(base: str, taken: set[str]) -> str:
    """`base`, or `base_2`, `base_3`... when taken; the result is reserved in `taken`."""
    name, n = base, 2
    while name in taken:
        name, n = f"{base}_{n}", n + 1
    taken.add(name)
    return name


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
        item = {"id": id_, "level": level, "title": title, "body": body, "grade": tr(grade), "src": tr(src), "targets": targets}
        if fix:
            item["fix"] = fix
        self.items.append(item)


def advisories(design: dict, catalog: dict | None) -> list[dict]:
    """All advisories for a canonical, already validated design, most severe first (stable within a level)."""
    out = _Collector(design, catalog)
    lay = layout(design)
    for rule in (_site, _hinged_doors, _sliding_doors, _drawers, _spans, _zones, _inserts, _hanging, _board):
        rule(design, lay, out)
    return sorted(out.items, key=lambda a: LEVEL_ORDER[a["level"]])


def _site(design: dict, lay: Layout, out: _Collector) -> None:
    site = design["site"] or {}
    ceiling, niche = site.get("ceiling"), site.get("niche")
    # R1: a carcass assembled lying down pivots on its back-bottom corner when it is raised [97].
    if ceiling:
        diagonal = math.hypot(lay.height, lay.depth)
        max_height = int(math.sqrt(max(0, (ceiling - 10) ** 2 - lay.depth ** 2)) // 10 * 10)
        lower = out.fix(tr("הנמך ל-{h} ס״מ", h=cm(max_height)), [{"op": "update_dimensions", "height": max_height}])
        if lay.height > ceiling:
            out.add("r1-over", "critical", tr("הארון גבוה מהתקרה"),
                    tr("גובה {h} ס״מ מול תקרה של {c} ס״מ.", h=cm(lay.height), c=cm(ceiling)), "מדידה", "סעיף 5.1", ["carcass"], lower)
        elif diagonal + 10 > ceiling:
            out.add("r1-lift", "warn", tr("הגוף לא יתרומם לעמידה"),
                    tr("גוף שהורכב בשכיבה מסתובב סביב הפינה האחורית: האלכסון {d} ס״מ, והתקרה {c} ס״מ. "
                       "הגובה המרבי הוא {m} ס״מ, ואת ההפרש סוגרים בפילר עליון.", d=cm(diagonal), c=cm(ceiling), m=cm(max_height)), "הערכה", "[97]",
                    ["carcass"], lower)
        elif ceiling - lay.height > 60:
            out.add("r1-gap", "info", tr("{g} ס״מ עד התקרה", g=cm(ceiling - lay.height)),
                    tr("מקובל לסגור את המרווח בפילר עליון או בכרכוב, אחרי שהגוף הורם למקום."), "כלל אצבע", "[97]", ["carcass"])
    # R12: niche fit and fillers [38][96].
    if niche:
        gap = niche - lay.width
        narrower = out.fix(tr("התאם ל-{w} ס״מ", w=cm(niche - 50)), [{"op": "update_dimensions", "width": niche - 50}])
        if gap < 0:
            out.add("niche-over", "critical", tr("הארון רחב מהנישה"),
                    tr("{w} ס״מ מול נישה של {n} ס״מ (הרוחב הקטן מבין שלוש המדידות).", w=cm(lay.width), n=cm(niche)), "מדידה",
                    "סעיף 5.1", ["carcass"], narrower)
        elif design["doors"]["type"] == "hinged" and gap < 40:
            out.add("r12-filler", "warn", tr("דלת ציר צמודה לקיר"),
                    tr("דלת ציר ליד קיר צריכה פילר, כדי להיפתח מעבר ל-90° בלי לשפשף את הקיר. מומלץ לפחות 2 ס״מ בכל צד."),
                    "כלל אצבע", "[38][96]", ["carcass"], narrower)
        elif 40 <= gap <= 300:
            out.add("r12-gap", "info", tr("פילר {f} ס״מ בכל צד", f=cm(gap / 2)),
                    tr("הפילרים סוגרים את הנישה ומשמשים מרווח לפתיחת הדלתות. הנגר מכייל אותם במדידה באתר."),
                    "כלל אצבע", "[96]", ["carcass"])


def _hinged_doors(design: dict, lay: Layout, out: _Collector) -> None:
    """R3 door width, R4 hinge count, R6 mirror weight and safety [3][5][13][17][21]."""
    if lay.doors and design["doors"]["type"] == "hinged":
        wide = [d for d in lay.doors if d.width > MAX_HINGED_WIDTH]
        if wide:
            worst = max(d.width for d in wide)
            # A door can be split when it is alone over its compartment and its zone: the same compartment
            # and the same anchors (a full-height door has none).
            lone = [d for d in wide if d.compartment is not None
                    and sum(1 for x in lay.doors if (x.compartment, x.anchors) == (d.compartment, d.anchors)) == 1]
            taken = _ids(design)
            split = out.fix(tr("פצל לשתי דלתות"), [{"op": "split_door", "id": d.id, "newId": _free(f"dr_{_tag(d.id, 30)}_2", taken)}
                                                for d in lone]) if lone else None
            count = tr("דלת אחת") if len(wide) == 1 else tr("{n} דלתות", n=len(wide))
            out.add("r3-wide", "warn" if worst > MAX_HINGED_WIDTH_EXTRA else "info", tr("דלת רחבה מדי לציר סמוי"),
                    tr("{count} ברוחב עד {w} ס״מ. צירים סמויים מוגדרים עד 60 ס״מ, ו-65 עם ציר נוסף.", count=count, w=cm(worst)), "יצרן", "[3]",
                    [f"door:{d.id}" for d in wide], split)
        mirror = next((d for d in lay.doors if d.mirror), None)
        plain = next((d for d in lay.doors if not d.mirror), lay.doors[0])
        if mirror and mirror.kg > HEAVY_DOOR_KG:
            count = 2 if lay.width <= 2000 else 3
            to_sliding = out.fix(tr("עבור לדלתות הזזה"), [{"op": "configure_doors", "type": "sliding",
                                                       "ids": [f"dr_s{i + 1}" for i in range(count)]}])
            out.add("r6-mirror", "warn", tr("דלת מראה כבדה לציר"),
                    tr("מראה של 4 מ״מ על לוח מוסיפה כ-10 ק״ג למ״ר. הדלת שוקלת כ-{kg} ק״ג, מעבר לטבלאות "
                       "הצירים. בדלת כזו עדיפה הזזה במסילה של 50–100 ק״ג.", kg=round(mirror.kg)), "הערכה", "[17][13]", [f"door:{mirror.id}"],
                    to_sliding)
        plains = [d for d in lay.doors if not d.mirror] or lay.doors
        if len({d.height for d in plains}) == 1:
            title = tr("{n} צירים לכל דלת", n=plain.hinges)
            body = tr("דלת {h} ס״מ, כ-{kg} ק״ג. המספר נקבע לפי הגובה ולפי המשקל, הגבוה מביניהם.", h=cm(plain.height), kg=round(plain.kg))
        else:  # zone doors: each door by its own height and weight
            counts = sorted({d.hinges for d in plains})
            title = (tr("{n} צירים לכל דלת", n=counts[0]) if len(counts) == 1
                     else tr("{a}–{b} צירים לדלת, לפי הגובה", a=counts[0], b=counts[-1]))
            heights = sorted({(d.height, d.hinges) for d in plains}, reverse=True)
            body = tr("המספר נקבע לכל דלת לפי הגובה שלה ולפי המשקל, הגבוה מביניהם: {list}.",
                      list=", ".join(tr("{h} ס״מ – {n}", h=cm(h), n=n) for h, n in heights))
        out.add("r4-hinges", "info", title,
                body + (tr(" לדלת המראה: {n}.", n=mirror.hinges) if mirror and mirror is not plain else ""), "יצרן", "[3][5]",
                [f"door:{d.id}" for d in lay.doors])
    if any(d.mirror for d in lay.doors):
        out.add("r6-safety", "info", tr("מראה עם גיבוי בטיחות"),
                tr("מראה בדלת ארון מגובה ביריעת בטיחות (סיווג EN 12600), כדי שלא תתנפץ לרסיסים."), "תקן", "[21]",
                [f"door:{d.id}" for d in lay.doors if d.mirror])


def _sliding_doors(design: dict, lay: Layout, out: _Collector) -> None:
    """R5 depth and access, R10 drawers behind the overlap [11][13][14][15][38][39]."""
    comps = design["compartments"]
    if lay.sliding and lay.doors:
        usable = lay.depth - SLIDE_TRACK_DEPTH - lay.panel
        hanging = [i for i, c in enumerate(comps) if c["rails"] or any(x["type"] == "pulldown" for x in c["inserts"])]
        if hanging and usable < HANG_DEPTH:
            depth = HANG_DEPTH + SLIDE_TRACK_DEPTH + lay.panel + 3
            out.add("r5-depth", "warn", tr("אין מספיק עומק לתלייה"),
                    tr("המסילות תופסות 8–10 ס״מ מהעומק. נשארים כ-{u} ס״מ, ותלייה צריכה {need} לפחות.", u=cm(usable), need=cm(HANG_DEPTH)),
                    "יצרן", "[11][15][39]", [f"comp:{i}" for i in hanging],
                    out.fix(tr("הגדל עומק ל-{d} ס״מ", d=cm(depth)), [{"op": "update_dimensions", "depth": depth}]))
        count = len(lay.doors)
        if count > 1:
            share = tr("שליש") if count == 3 else tr("חצי") if count == 2 else f"1/{count}"
            out.add("r5-open", "info", tr("{n} דלתות הזזה בחפיפה של 2 ס״מ", n=count),
                    tr("בכל רגע פתוח לכל היותר {share} מרוחב הארון.", share=share), "חישוב", "[13][14]", [f"door:{d.id}" for d in lay.doors])
        overlaps = [(d.x0, d.x0 + SLIDE_OVERLAP) for d in lay.doors[1:]]
        def box_hits(i: int) -> bool:  # the drawer box, not the compartment: the overlap sits over a partition
            x0, x1 = lay.ranges[i][0] + DRAWER_SIDE_CLEARANCE, lay.ranges[i][1] - DRAWER_SIDE_CLEARANCE
            return any(a < x1 and b > x0 for a, b in overlaps)

        blocked = [i for i, c in enumerate(comps) if c["drawers"] and box_hits(i)]
        if blocked:
            out.add("r10-slide", "warn", tr("מגירות בתחום החפיפה"),
                    tr("מאחורי דלתות הזזה, מגירה חייבת לשבת בתוך הפתח של דלת אחת ומחוץ לחפיפה. אחרת הדלת חוסמת אותה."),
                    "יצרן", "[38][15]", [f"comp:{i}" for i in blocked])
    elif design["doors"]["type"] == "hinged":
        # Only drawers behind a door: an open compartment or an open zone has no hinge to hit.
        behind = [i for i, c in enumerate(comps)
                  if any(lay.behind(d, dr["y"], dr["height"]) for d in lay.doors if i in d.compartments for dr in c["drawers"])]
        if behind:
            out.add("r10-hinge", "info", tr("מגירות מאחורי דלת ציר"),
                    tr("כדי שהמגירה לא תתנגש בציר, מוסיפים ספייסר של עד 25 מ״מ בכל צד, או ציר 155° ללא בליטה."),
                    "יצרן", "[36][37]", [f"comp:{i}" for i in behind])


def _drawers(design: dict, lay: Layout, out: _Collector) -> None:
    """R11: concealed runners need 11-16 mm drawer sides [28][32]."""
    with_drawers = [i for i, c in enumerate(design["compartments"]) if c["drawers"]]
    if with_drawers:
        out.add("r11-runner", "info", tr("תיבות מגירה מלוח 16 מ״מ"),
                tr("מסילות סמויות דורשות דפנות מגירה של 11–16 מ״מ, ולכן לוח 17 לא מתאים. מתכננים תיבה מלוח 16, "
                   "או מערכת עם דפנות מתכת. רוחב פנימי = רוחב התא פחות 42 מ״מ."), "יצרן", "[28][32]",
                [f"comp:{i}" for i in with_drawers])


def _spans(design: dict, lay: Layout, out: _Collector) -> None:
    """R7 shelf span [22][25], R8 rail span [41]. The fix splits the compartment in the middle."""
    comps = design["compartments"]

    def split(i: int) -> dict | None:
        c = comps[i]
        tag = _tag(c["id"], 30)
        return out.fix(tr("חלק את התא"), [{"op": "add_partition", "compartmentId": c["id"], "offset": (c["width"] - lay.panel) // 2,
                                       "id": f"prt_{tag}_s", "newCompartmentId": f"cmp_{tag}_s"}])

    # A divider is fixed at both ends, which halves the sag [26]. The research's work rule (§2.1) takes fixing as
    # a remedy for 80-100 cm spans, so dividers alone are flagged only above that.
    long_shelves = [i for i, c in enumerate(comps)
                    if any(c["width"] > (MAX_FIXED_SHELF_SPAN if s["fixed"] else MAX_SHELF_SPAN) for s in c["shelves"])]
    if long_shelves:
        out.add("r7-sag", "warn", tr("מדף ארוך עלול לשקוע"),
                tr("מדף של {w} ס״מ במלמין 17 מ״מ: עד כ-80 ס״מ לבגדים "
                   "מקופלים, וכ-60 לספרים. זחילה לאורך זמן מקצרת עוד.", w=cm(max(comps[i]['width'] for i in long_shelves))), "הערכה", "[22][25]",
                [f"comp:{i}" for i in long_shelves], split(long_shelves[0]))
    long_rails = [i for i, c in enumerate(comps) if c["rails"] and c["width"] > RAIL_SUPPORT_SPAN]
    if long_rails:
        worst = max(comps[i]["width"] for i in long_rails)
        too_long = worst > MAX_RAIL_SPAN
        out.add("r8-rail", "warn" if too_long else "info", tr("מוט תלייה ארוך מדי") if too_long else tr("למוט נדרשת תמיכה אמצעית"),
                tr("מוט עגול 25 מ״מ: מ-80 ס״מ צריך תמיכה באמצע, ולא יותר מ-100 ס״מ בסך הכול. כאן {w} ס״מ.", w=cm(worst)),
                "יצרן", "[41]", [f"comp:{i}" for i in long_rails],
                split(next(i for i in long_rails if comps[i]["width"] == worst)) if too_long else None)


def _zones(design: dict, lay: Layout, out: _Collector) -> None:
    """R20: a divider between zones is a fixed shelf. It stiffens the carcass [29] and, fixed at both ends, sags
    about half as much [26], but unlike a shelf on pins its height is set before manufacturing."""
    comps = design["compartments"]
    zoned = [i for i, c in enumerate(comps) if any(s["fixed"] for s in c["shelves"])]
    if zoned:
        count = sum(s["fixed"] for i in zoned for s in comps[i]["shelves"])
        out.add("r20-dividers", "info", tr("מדף קבוע בין אזורים") if count == 1 else tr("{n} מדפים קבועים בין אזורים", n=count),
                tr("מדף שמחלק תא לאזורים מחובר בקונפירמט לדפנות ולמחיצות, בעומק המחיצות, ולא יושב על פינים. הוא מקשיח "
                   "את הגוף, וקיבוע הקצוות מקטין את השקיעה בכחצי. את הגובה שלו קובעים לפני הייצור: אחר כך הוא לא זז "
                   "כמו מדף על פינים."), "כלל אצבע", "[26][29]", [f"comp:{i}" for i in zoned])


def _inserts(design: dict, lay: Layout, out: _Collector) -> None:
    """R16 pull-down, R17 shoes, R18 trousers [35][39][43][44], R19 LED and the electrical point (§6)."""
    comps = design["compartments"]
    for i, c in enumerate(comps):
        n = i + 1
        pulldown = next((x for x in c["inserts"] if x["type"] == "pulldown"), None)
        high = next((r for r in sorted(c["rails"], key=lambda r: -r["y"]) if lay.floor_y(r["y"]) > 1900), None)
        fits = PULLDOWN_WIDTH[0] <= c["width"] <= PULLDOWN_WIDTH[1]
        if high and not pulldown:
            swap = out.fix(tr("החלף במתקן נשלף"), [
                {"op": "remove_component", "id": high["id"]},
                {"op": "add_insert", "compartmentId": c["id"], "type": "pulldown", "y": high["y"],
                 "id": f"ins_{_tag(c['id'], 30)}_p"},
            ]) if fits else None
            out.add(f"r16-high-{i}", "info", tr("מוט גבוה בתא {n}", n=n),
                    tr("המוט בגובה {h} ס״מ מהרצפה. מעל כ-190 ס״מ נוח יותר מתקן תלייה נשלף.", h=cm(lay.floor_y(high['y'])))
                    + ("" if fits else tr(" המתקנים בשוק ברוחב 83–115 ס״מ, והתא ברוחב {w}.", w=cm(c['width']))),
                    "הערכה", "[43][44]", [f"comp:{i}"], swap)
        if pulldown and not fits:
            out.add(f"r16-width-{i}", "warn", tr("מתקן נשלף לא בגודל התא {n}", n=n),
                    tr("מתקני תלייה נשלפים מיוצרים ברוחב 83–115 ס״מ, והתא ברוחב {w}. "
                       "משנים את רוחב התא או מוותרים על המתקן.", w=cm(c['width'])), "יצרן", "[43]", [f"comp:{i}"],
                    out.fix(tr("הסר את המתקן"), [{"op": "remove_component", "id": pulldown["id"]}]))
        for x in c["inserts"]:
            if x["type"] == "shoes":
                pairs = x["tiers"] * (c["width"] // 220)
                out.add(f"r17-shoes-{i}", "warn" if lay.shelf_depth < 350 else "info", tr("{pairs} זוגות נעליים בתא {n}", pairs=pairs, n=n),
                        tr("{tiers} קומות משופעות בגובה {h} ס״מ, בעומק {d}. "
                           "מקובל: 22–26 ס״מ לקומה ו-35 ס״מ עומק לפחות.", tiers=x['tiers'], h=cm(SHOE_TIER), d=cm(lay.shelf_depth)), "כלל אצבע", "[35]", [f"comp:{i}"])
            elif x["type"] == "trousers":
                narrow = c["width"] < 450
                out.add(f"r18-trousers-{i}", "warn" if narrow else "info", tr("מתקן מכנסיים בתא {n}", n=n),
                        tr("נשלף עד גובה {h} ס״מ. מכנסיים מקופלים על מוט צריכים 60–70 ס״מ.", h=cm(lay.floor_y(x['y'] + x['height'])))
                        + (tr(" התא צר מדי למתקן סטנדרטי.") if narrow else ""), "יצרן", "[39]", [f"comp:{i}"])
    lit = [i for i, c in enumerate(comps) if any(x["type"] == "led" for x in c["inserts"])]
    if lit:
        out.add("r19-led", "info", tr("תאורת LED בתא אחד") if len(lit) == 1 else tr("תאורת LED ב-{n} תאים", n=len(lit)),
                tr("נדלקת בפתיחת הדלת (חיישן). צריך נקודת חשמל בנישה או ספק 12V מוסתר. מתאמים עם חשמלאי לפני הייצור."),
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
            out.add(f"r9-short-{i}", "warn", tr("אזור תלייה קצר בתא {n}", n=i + 1),
                    tr("באזור הקצר יש {h} ס״מ. חולצה תלויה צריכה כ-80 ס״מ ועוד קולב, כלומר כ-90.", h=cm(shortest)),
                    "כלל אצבע", "[35][39][40]", [f"comp:{i}"])
        elif len(zones) == 1 and shortest < 1400:
            out.add(f"r9-long-{i}", "info", tr("תלייה לחולצות בתא {n}", n=i + 1),
                    tr("יש {h} ס״מ מתחת למוט: מספיק לחולצות, לא למעילים (כ-100 ס״מ) ולשמלות ארוכות (עד 190).", h=cm(shortest)),
                    "כלל אצבע", "[35][39]", [f"comp:{i}"])


def _board(design: dict, lay: Layout, out: _Collector) -> None:
    """R2: board thickness against the Israeli market [59]-[62]."""
    if lay.panel == 17:
        out.add("r2-board", "info", tr("לוח 17 מ״מ"),
                tr("המלמין הסטנדרטי בישראל הוא 17 מ״מ, בלוחות של 244×122 ס״מ. כל המידות בתכנון מחושבות לפי 17."),
                "ספק", "[59]–[62]", ["carcass"])
    else:
        out.add("r2-board", "info", tr("לוח {t} מ״מ", t=lay.panel),
                tr("בישראל המלמין הסטנדרטי הוא 17 מ״מ (ו-28 כעבה). לוח {t} מ״מ לא תמיד במלאי. "
                   "בודקים מול הספק לפני הייצור.", t=lay.panel), "ספק", "[59]–[62]", ["carcass"])
