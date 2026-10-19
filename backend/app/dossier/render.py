"""The carpenter's dossier: design -> page data -> HTML (Jinja2, autoescaped) -> PDF (Chromium, ADR-019).

In Hebrew, English, Russian or Arabic (ADR-029): `build` and `render_html` run inside `language(lang)`, so every
text from here, the part notes, the hardware and the advisories comes out in that language (app/i18n.py), and
the page direction follows it. Part names and groups stay Hebrew in the data and are translated on display.

Port of dossier.js in the P2 prototype. `build` and `render_html` are pure. `html_to_pdf` is the only
I/O: a headless Chromium with JavaScript off, offline, and a route that aborts every request that isn't
`data:` or `about:`, so nothing in the page can reach the network (no SSRF, no tracking). Fonts come
from the system and the CSS is inlined. Deadlines bound the browser launch and, separately, the page
work; on either one Chromium is closed and the driver stopped. (Cancelling while Playwright's driver
is still starting can leave asyncio.run waiting on the driver forever, so the deadline never covers it.)
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import math
import re
from datetime import date
from itertools import batched
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup, escape
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Route, async_playwright

from app.advice.rules import advisories, obstacle_name
from app.domain.room import front_clearance, side_gap, walls
from app.domain.layout import Layout, layout
from app.i18n import LANGUAGES, is_rtl, language, long_date, template, tr
from app.production import drawings
from app.production.boards import Board, board_for
from app.production.estimate import VAT, Estimate, estimate, shekel
from app.production.nesting import SHEET, Nesting, nest
from app.production.parts import GROUPS, Production, half_up, production

TEMPLATES = Path(__file__).with_name("templates")
ALLOWED_URLS = ("data:", "about:")
LAUNCH_TIMEOUT_S = 20
RENDER_TIMEOUT_S = 30  # loading the page and printing it
CUT_ROWS_PER_PAGE = 30
COMPS_FIRST_PAGE, COMPS_PER_PAGE = 4, 8
LEGEND_FIRST_PAGE, LEGEND_PER_PAGE = 14, 36  # lines of two parts
ADVICE_PER_PAGE = 12
DOOR_LABELS = {"hinged": "ציר", "sliding": "הזזה", "none": "ללא (ארון פתוח)"}
# Full names, not the bare words: "מוט" alone is also a hanging rail, and one Hebrew source has one translation.
HANDLE_LABELS = {"bar": "ידית מוט", "knob": "כפתור", "edge": "פרופיל ידית", "cup": "ידית שקועה", "groove": "חריץ אחיזה",
                 "none": "לחיצה"}
HANDLE_FINISHES = {"steel": "נירוסטה", "black": "שחור", "brass": "פליז"}
INSERT_NAMES = {"pulldown": "מתקן נשלף", "shoes": "נעליים", "trousers": "מכנסיים", "led": "LED", "tv": "מסך"}


class RenderError(Exception):
    """Chromium failed or timed out. The message is ours, never the browser's."""


def cm(mm: float) -> str:
    value = half_up(mm) / 10
    return str(int(value)) if value == int(value) else f"{value:.1f}"


def _pages(title: str, chunks: list, kind: str, **first) -> list[dict]:
    """One page per chunk; the title is numbered when there is more than one."""
    many = len(chunks) > 1
    return [{"kind": kind, "title": f"{title} ({k + 1})" if many else title, "toc": k == 0, "chunk": chunk,
             "first": k == 0, **(first if k == 0 else {})} for k, chunk in enumerate(chunks)]


def row_pages(rows: list[dict], size: int) -> list[list[dict]]:
    """Pages of at most `size` table rows that never end on a group heading."""
    pages: list[list[dict]] = [[]]
    for row in rows:
        if len(pages[-1]) == size or (len(pages[-1]) == size - 1 and "group" in row):
            pages.append([])
        pages[-1].append(row)
    return pages


def _contents(c: dict) -> str:
    fixed = sum(s["fixed"] for s in c["shelves"])
    out = [tr("{n} אזורים", n=fixed + 1)] if fixed else []
    # Literal templates only (a test enforces it): one label for one item, a counted one for more.
    labels = {"shelves": lambda n: tr("מדף") if n == 1 else tr("{n} מדפים", n=n),
              "rails": lambda n: tr("מוט") if n == 1 else tr("{n} מוטות", n=n),
              "drawers": lambda n: tr("מגירה") if n == 1 else tr("{n} מגירות", n=n)}
    for key, label in labels.items():
        n = len(c[key]) - (fixed if key == "shelves" else 0)  # dividers are counted as zones
        if n:
            out.append(label(n))
    out += [tr(INSERT_NAMES[x["type"]]) for x in c["inserts"]]
    return ", ".join(out) or tr("ריק")


def build(design: dict, catalog: dict, render_png: bytes | None = None, today: date | None = None,
          lang: str = "he", customer: dict | None = None) -> dict:
    """Everything the template needs, for a canonical, already validated design, in `lang`. Pure.
    `customer`: the customer's details (ADR-038, app/dossier/customer.py), shown on the site page."""
    with language(lang):
        context = _build(design, catalog, render_png, today, customer)
    return {**context, "lang": lang, "dir": "rtl" if is_rtl(lang) else "ltr"}


def _build(design: dict, catalog: dict, render_png: bytes | None, today: date | None, customer: dict | None = None) -> dict:
    lay = layout(design)
    prod = production(design, catalog)
    nesting = nest(prod.parts)
    est = estimate(prod, nesting)
    adv = advisories(design, catalog)
    parts_by_no = {p.no: p for p in prod.parts}
    site = design["site"] or {}
    ceiling, niche = site.get("ceiling"), site.get("niche")
    digest = hashlib.sha256(json.dumps(design, sort_keys=True).encode()).hexdigest()
    meta = {"project": tr("ארון בהתאמה"), "id": f"BN-{digest[:8].upper()}", "rev": tr("טיוטה"),
            "date": long_date(today or date.today())}
    doors_type = design["doors"]["type"]
    count = sum(p.qty for p in prod.parts)
    pages = [_cover(design, catalog, lay, nesting, est, adv, render_png, count)]
    # The customer's details (ADR-038) on a page of their own, right after the cover: room for long notes.
    rows, notes = _customer_rows(customer), (customer or {}).get("notes")
    if rows or notes:
        pages.append({"kind": "customer", "title": tr("פרטי לקוח"), "toc": True, "rows": rows, "notes": notes})

    # Front and plan.
    front_svg = drawings.front_elevation(design, lay, catalog)
    site_note = " · ".join(([tr("נישה {v}", v=niche)] if niche else []) + ([tr("תקרה {v}", v=ceiling)] if ceiling else []))
    lead = [tr("כל המידות במילימטרים.")]
    if doors_type == "hinged":
        lead.append(tr("החזית מוצגת עם דלתות סגורות. קווי הפתיחה מצביעים לצד הציר, והעיגולים המקווקווים הם כוסות הצירים."))
    if doors_type != "sliding" and any(s["fixed"] for c in design["compartments"] for s in c["shelves"]):
        lead.append(tr("בתא שמחולק לאזורים, המידות האנכיות בתוכו נמדדות בין קווי האמצע של המדפים הקבועים."))
    pages.append({"kind": "front", "title": tr("חזית ותוכנית"), "toc": True, "front": front_svg,
                  "plan": drawings.plan_view(design, lay, catalog, prod.partition_depth),
                  "caption": (tr("חזית · {note} (מידות משוערות של הלקוח)", note=site_note) if site_note
                              else tr("חזית · לא נמסרו מידות אתר")),
                  "lead": " ".join(lead)})

    # Interior. Shop drawings follow the physical left-to-right order, even on an RTL page.
    comps = [{"svg": drawings.compartment_elevation(design, lay, i),
              "caption": tr("תא {n} · {contents} · גבהים מהרצפה", n=i + 1, contents=_contents(c))} for i, c in enumerate(design["compartments"])]
    chunks = [comps[:COMPS_FIRST_PAGE]] + list(batched(comps[COMPS_FIRST_PAGE:], COMPS_PER_PAGE))
    pages += _pages(tr("פנים"), chunks, "interior", interior=drawings.interior_elevation(design, lay))

    # Exploded view; its legend continues on extra pages when the parts don't fit.
    legend = list(batched([p for p in prod.parts if p.boxes], 2))
    chunks = [legend[:LEGEND_FIRST_PAGE]] + list(batched(legend[LEGEND_FIRST_PAGE:], LEGEND_PER_PAGE))
    pages += _pages(tr("מבט מפוצץ"), chunks, "exploded", svg=drawings.exploded_view(prod))

    # Materials, hardware and the estimate.
    boards = [{"board": prod.boards[key], "sheets": n, "edge": prod.edge_m.get(key),
               "uses": ", ".join(dict.fromkeys(tr(p.group) for p in prod.parts if p.board.key == key))}
              for key, n in nesting.by_board.items()]
    pages.append({"kind": "materials", "title": tr("חומרים ופרזול"), "toc": True, "method": prod.method, "boards": boards,
                  "hardware": prod.hardware})
    pages.append({"kind": "estimate", "title": tr("אומדן עלות חומרים"), "toc": True, "est": est, "vat": round(VAT * 100)})

    # Cut list by group, then the sheets two to a page.
    rows: list[dict] = []
    for group in GROUPS:
        members = sorted((p for p in prod.parts if p.group == group), key=lambda p: p.no)
        if members:
            rows.append({"group": group})
            rows += [{"part": p, "glyph": drawings.edge_glyph(p)} for p in members]
    pages += _pages(tr("רשימת חיתוך"), row_pages(rows, CUT_ROWS_PER_PAGE), "cutlist", count=count)

    sheets = [drawings.sheet_drawing(s, parts_by_no, uid=f"sh{k}") for k, s in enumerate(nesting.sheets)]
    pages += _pages(tr("שיבוץ לוחות"), list(batched(sheets, 2)) or [()], "nesting", nesting=nesting,
                    oversize=", ".join(f"#{no}" for no, _ in nesting.oversize))

    # Site checks, then the advisories with the closing declaration.
    pages.append(_site(design, lay, prod))
    pages += _pages(tr("הערות הייעוץ"), list(batched(adv, ADVICE_PER_PAGE)) or [()], "advice")
    pages[-1]["last"] = True

    for no, page in enumerate(pages, 1):
        page["no"] = no
    toc = [(p["title"].split(" (")[0], p["no"]) for p in pages if p["toc"]]
    return {"pages": pages, "meta": meta, "toc": toc, "lay": lay, "sheet": SHEET}


def _cover(design: dict, catalog: dict, lay: Layout, nesting: Nesting, est: Estimate, adv: list[dict],
           render_png: bytes | None, count: int) -> dict:
    doors_type, handles = design["doors"]["type"], design["handles"]
    carcass = board_for(design["carcass"]["appearance"], lay.panel, catalog)
    fronts = board_for(design["doors"]["appearance"], lay.panel, catalog)
    warn = sum(a["level"] != "info" for a in adv)
    return {"kind": "cover", "title": tr("שער"), "toc": False, "cls": "cover",
            # The render when the customer made one; otherwise the front elevation.
            "image": f"data:image/png;base64,{base64.b64encode(render_png).decode()}" if render_png else None,
            "drawing": None if render_png else drawings.front_elevation(design, lay, catalog, uid="cv"),
            "spec": [(tr("רוחב"), tr("{v} ס״מ", v=cm(lay.width))), (tr("גובה"), tr("{v} ס״מ", v=cm(lay.height))),
                     (tr("עומק"), tr("{v} ס״מ", v=cm(lay.depth))), (tr("תאים"), str(len(lay.ranges))),
                     (tr("דלתות"), tr(DOOR_LABELS[doors_type]) + (f" · {len(lay.doors)}" if lay.doors else "")),
                     (tr("ידיות"), f"{tr(HANDLE_LABELS[handles['style']])} · {tr(HANDLE_FINISHES[handles['finish']])}"),
                     (tr("גוף"), carcass.name), (tr("חזיתות"), fronts.name if doors_type != "none" else "—")],
            "range": f"{shekel(est.lo_vat)}–{shekel(est.hi_vat)}",
            "summary": tr("כולל מע״מ · {sheets} לוחות · {parts} חלקים", sheets=len(nesting.sheets), parts=count),
            "warnings": ((tr("אזהרה פתוחה אחת") if warn == 1 else tr("{n} אזהרות פתוחות", n=warn)) + tr(", פירוט בעמודי הייעוץ")
                         if warn else tr("אין אזהרות פתוחות. הערות מידע בעמודי הייעוץ."))}


def _site(design: dict, lay: Layout, prod: Production) -> dict:
    site, doors_type = design["site"] or {}, design["doors"]["type"]
    ceiling, niche = site.get("ceiling"), site.get("niche")
    diagonal = math.hypot(lay.height, lay.depth)  # a carcass raised from lying down pivots on this [97]
    hinged_widths = [d.width for d in lay.doors] if doors_type == "hinged" else []
    return {"kind": "site", "title": tr("אתר ובדיקות"), "toc": True, "ceiling": ceiling, "niche": niche,
            "filler": max(0, (niche - lay.width) / 2) if niche else None, "diagonal": diagonal,
            "lift_ok": diagonal + 10 <= ceiling if ceiling else None, "anchors": prod.anchors,
            "reach": max(hinged_widths) if hinged_widths else None,
            "reach_label": {"sliding": tr("הזזה, ללא"), "none": tr("ללא דלתות")}.get(doors_type, ""),
            "heights": _readings(site.get("heights"), "heights"),
            "widths": _readings(site.get("widths"), "widths"),
            "clearance": site.get("clearance") if site.get("clearance") is not None else front_clearance(design),
            "clearance_from_room": site.get("clearance") is None and design["room"] is not None,
            "room": _room_lines(design),
            "household": " · ".join(tr("{name} {h} ס״מ", name=p["name"], h=cm(p["height"])) if p["name"]
                                    else tr("{h} ס״מ", h=cm(p["height"])) for p in design["household"]["people"]),
            "obstacles": [tr("{name}: {x} ס״מ מקצה הארון השמאלי, {y} ס״מ מהרצפה, {w}×{h} ס״מ", name=obstacle_name(o["type"], o.get("name")),
                             x=cm(o["x"]), y=cm(o["y"]), w=cm(o["width"]), h=cm(o["height"]))
                          for o in site.get("obstacles") or []],
            "checks": _checks(lay, diagonal)}


def _customer_rows(customer: dict | None) -> list[tuple[str, str]]:
    """The customer's details as (label, value) rows, without the notes (a paragraph of their own); the values
    stay as the customer wrote them."""
    if not customer:
        return []
    c = customer
    place = ", ".join(v for v in (c.get("address"), c.get("city")) if v)
    floor = None
    if c.get("floor") is not None:
        floor = tr("קומה {n}", n=c["floor"])
        if c.get("elevator") is not None:
            floor += tr(", יש מעלית") if c["elevator"] else tr(", אין מעלית")
    elif c.get("elevator") is not None:
        floor = tr("יש מעלית") if c["elevator"] else tr("אין מעלית")
    when = long_date(c["install_date"]) if c.get("install_date") else None
    rows = [(tr("שם"), c.get("name")), (tr("טלפון"), c.get("phone")), (tr("דוא״ל"), c.get("email")),
            (tr("כתובת להתקנה"), place or None), (tr("קומה ומעלית"), floor), (tr("זמני התקשרות"), c.get("contact_times")),
            (tr("מועד התקנה רצוי"), when)]
    return [(label, value) for label, value in rows if value]


def _room_lines(design: dict) -> list[str]:
    """The room (ADR-037): its plan, the wall the wardrobe stands on, and the space beside it."""
    room = design["room"]
    if not room:
        return []
    s = room["shape"]
    if s["kind"] == "l":
        plan = tr("חדר בצורת L, {w}×{d} ס״מ, בלי פינה של {cw}×{cd} ס״מ", w=cm(s["width"]), d=cm(s["depth"]),
                  cw=cm(s["cutWidth"]), cd=cm(s["cutDepth"]))
    elif s["kind"] == "recess":
        plan = tr("חדר {w}×{d} ס״מ עם נישה {rw}×{rd} ס״מ, {rx} ס״מ מהפינה השמאלית", w=cm(s["width"]), d=cm(s["depth"]),
                  rw=cm(s["recessWidth"]), rd=cm(s["recessDepth"]), rx=cm(s["recessX"]))
    else:
        plan = tr("חדר מלבני {w}×{d} ס״מ", w=cm(s["width"]), d=cm(s["depth"]))
    wall = walls(s)[room["wall"]]
    place = tr("הארון על קיר {n} (באורך {l} ס״מ), {o} ס״מ מקצהו השמאלי", n=room["wall"] + 1, l=cm(wall["length"]),
               o=cm(room["offset"]))
    left, right = side_gap(design, "left"), side_gap(design, "right")
    beside = tr("עד הקיר: משמאל {l} ס״מ, מימין {r} ס״מ", l=cm(left) if left is not None else "—",
                r=cm(right) if right is not None else "—")
    return [plan, place, beside]


def _readings(values: list | None, kind: str) -> str | None:
    """The customer's three readings, each named by where it was taken (— for an unknown one)."""
    if not values or len(values) != 3:  # the schema guarantees three; never fail a dossier over it
        return None
    a, b, c = (str(v) if v is not None else "—" for v in values)
    if kind == "heights":
        return tr("שמאל {a} · אמצע {b} · ימין {c}", a=a, b=b, c=c)
    return tr("למעלה {a} · באמצע {b} · למטה {c}", a=a, b=b, c=c)


def _checks(lay: Layout, diagonal: float) -> list[str]:
    return [
        tr("רוחב בשלושה גבהים. הקטן קובע."), tr("גובה בשלוש נקודות, ופילוס רצפה ותקרה."), tr("אנך הקירות ואלכסוני הנישה."),
        tr("פנלים, שקעים, מזגן, צנרת ותאורה בתחום הארון."), tr("סוג הקיר לעיגון, וסריקת כבלים."),
        tr("מסלול הכנסה מול החלק הגדול ביותר."),
        tr("אלכסון הרמה {mm} מ״מ מול התקרה וגופי התאורה.", mm=half_up(diagonal)), tr("לחות: קיר חיצוני או סמוך לחדר רחצה."),
        tr("מלאי הלוח אצל הספק: {t} מ״מ בכל הגוונים.", t=lay.panel), tr("זמינות לוח 16 מ״מ לתיבות המגירה."),
        tr("מרווח 2 ס״מ לפחות לדלת ציר ליד קיר."), tr("עיגון לשלד ולא לגב. מספר העוגנים לפי הרוחב."),
    ]


_NUMERIC_RUN = re.compile(r"\d+(?:[.,]\d+)?(?:\s?[–×]\s?\d+(?:[.,]\d+)?)+")


def ltr_runs(value: str) -> Markup:
    """Escape the text and isolate number ranges like 83–115 or 244×122 as left-to-right, which the RTL
    bidi algorithm would otherwise reverse."""
    out, last = Markup(""), 0
    for m in _NUMERIC_RUN.finditer(value):
        out += escape(value[last:m.start()]) + Markup('<span class="num">{}</span>').format(m.group())
        last = m.end()
    return out + escape(value[last:])


def _swatch(board: Board) -> Markup:
    grain = " swatch--grain" if board.grain else ""
    return Markup('<span class="swatch{}" style="background-color: {}"></span>').format(grain, board.tint)


def _t(source: str, **params) -> Markup:
    """Template helper: `source` in the current language, escaped; Markup params (like num()) stay markup."""
    text = Markup(escape(template(source)))
    return text.format(**params) if params else text


def _environment() -> Environment:
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True, undefined=StrictUndefined,
                      trim_blocks=True, lstrip_blocks=True)
    env.filters.update(mm=half_up, cm=cm, shekel=shekel, swatch=_swatch, ltr=ltr_runs)
    env.globals.update(t=_t, tr=tr)
    env.globals["css"] = Markup((TEMPLATES / "dossier.css").read_text(encoding="utf-8"))  # our own static file
    return env


_env = _environment()


def render_html(context: dict) -> str:
    with language(context.get("lang", "he")):  # the templates translate their own texts
        return _env.get_template("dossier.html.j2").render(**context)


async def _pdf(html: str, seen: list[tuple[str, bool]] | None, timeout: float) -> bytes:
    async def guard(route: Route) -> None:
        url = route.request.url
        allowed = url.startswith(ALLOWED_URLS)
        if seen is not None:
            seen.append((url, allowed))
        await (route.continue_() if allowed else route.abort())

    async def print_page() -> bytes:
        context = await browser.new_context(java_script_enabled=False, offline=True, service_workers="block")
        await context.route("**/*", guard)
        page = await context.new_page()
        await page.set_content(html, wait_until="load")
        return await page.pdf(format="A4", print_background=True, prefer_css_page_size=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(timeout=LAUNCH_TIMEOUT_S * 1000)
        try:
            return await asyncio.wait_for(print_page(), timeout)
        finally:
            await browser.close()


def html_to_pdf(html: str, seen: list[tuple[str, bool]] | None = None, timeout: float = RENDER_TIMEOUT_S) -> bytes:
    """Print the HTML to an A4 PDF. `seen` collects every URL the page tried to load, and whether it was let through."""
    try:
        return asyncio.run(_pdf(html, seen, timeout))
    except (TimeoutError, PlaywrightError, OSError) as error:
        raise RenderError("the dossier could not be rendered") from error


def render_pdf(design: dict, catalog: dict, render_png: bytes | None = None, today: date | None = None,
               lang: str = "he", customer: dict | None = None) -> bytes:
    if lang not in LANGUAGES:
        raise ValueError(f"unsupported language: {lang!r}")
    try:
        html = render_html(build(design, catalog, render_png, today, lang, customer))
    except (KeyError, IndexError, ValueError) as error:  # e.g. a translation with a wrong placeholder
        raise RenderError("the dossier could not be rendered") from error
    return html_to_pdf(html)
