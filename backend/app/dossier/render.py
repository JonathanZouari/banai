"""The carpenter's dossier: design -> page data -> HTML (Jinja2, autoescaped) -> PDF (Chromium, ADR-019).

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

from app.advice.rules import advisories
from app.domain.layout import Layout, layout
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
MONTHS = ("ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר")
DOOR_LABELS = {"hinged": "ציר", "sliding": "הזזה", "none": "ללא (ארון פתוח)"}
HANDLE_LABELS = {"bar": "מוט", "knob": "כפתור", "edge": "פרופיל", "cup": "שקועה", "groove": "חריץ", "none": "לחיצה"}
HANDLE_FINISHES = {"steel": "נירוסטה", "black": "שחור", "brass": "פליז"}
INSERT_NAMES = {"pulldown": "מתקן נשלף", "shoes": "נעליים", "trousers": "מכנסיים", "led": "LED"}


class RenderError(Exception):
    """Chromium failed or timed out. The message is ours, never the browser's."""


def cm(mm: float) -> str:
    value = half_up(mm) / 10
    return str(int(value)) if value == int(value) else f"{value:.1f}"


def hebrew_date(day: date) -> str:
    return f"{day.day} ב{MONTHS[day.month - 1]} {day.year}"


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
    out = [f"{fixed + 1} אזורים"] if fixed else []
    for key, one, many in (("shelves", "מדף", "מדפים"), ("rails", "מוט", "מוטות"), ("drawers", "מגירה", "מגירות")):
        n = len(c[key]) - (fixed if key == "shelves" else 0)  # dividers are counted as zones
        if n:
            out.append(one if n == 1 else f"{n} {many}")
    out += [INSERT_NAMES[x["type"]] for x in c["inserts"]]
    return ", ".join(out) or "ריק"


def build(design: dict, catalog: dict, render_png: bytes | None = None, today: date | None = None) -> dict:
    """Everything the template needs, for a canonical, already validated design. Pure."""
    lay = layout(design)
    prod = production(design, catalog)
    nesting = nest(prod.parts)
    est = estimate(prod, nesting)
    adv = advisories(design, catalog)
    parts_by_no = {p.no: p for p in prod.parts}
    site = design["site"] or {}
    ceiling, niche = site.get("ceiling"), site.get("niche")
    digest = hashlib.sha256(json.dumps(design, sort_keys=True).encode()).hexdigest()
    meta = {"project": "ארון בהתאמה", "id": f"BN-{digest[:8].upper()}", "rev": "טיוטה",
            "date": hebrew_date(today or date.today())}
    doors_type = design["doors"]["type"]
    count = sum(p.qty for p in prod.parts)
    pages = [_cover(design, catalog, lay, nesting, est, adv, render_png, count)]

    # Front and plan.
    front_svg = drawings.front_elevation(design, lay, catalog)
    site_note = " · ".join(([f"נישה {niche}"] if niche else []) + ([f"תקרה {ceiling}"] if ceiling else []))
    lead = "כל המידות במילימטרים."
    if doors_type == "hinged":
        lead += " החזית מוצגת עם דלתות סגורות. קווי הפתיחה מצביעים לצד הציר, והעיגולים המקווקווים הם כוסות הצירים."
    if doors_type != "sliding" and any(s["fixed"] for c in design["compartments"] for s in c["shelves"]):
        lead += " בתא שמחולק לאזורים, המידות האנכיות בתוכו נמדדות בין קווי האמצע של המדפים הקבועים."
    pages.append({"kind": "front", "title": "חזית ותוכנית", "toc": True, "front": front_svg,
                  "plan": drawings.plan_view(design, lay, catalog, prod.partition_depth),
                  "caption": f"חזית · {site_note} (מידות משוערות של הלקוח)" if site_note else "חזית · לא נמסרו מידות אתר",
                  "lead": lead})

    # Interior. Shop drawings follow the physical left-to-right order, even on an RTL page.
    comps = [{"svg": drawings.compartment_elevation(design, lay, i),
              "caption": f"תא {i + 1} · {_contents(c)} · גבהים מהרצפה"} for i, c in enumerate(design["compartments"])]
    chunks = [comps[:COMPS_FIRST_PAGE]] + list(batched(comps[COMPS_FIRST_PAGE:], COMPS_PER_PAGE))
    pages += _pages("פנים", chunks, "interior", interior=drawings.interior_elevation(design, lay))

    # Exploded view; its legend continues on extra pages when the parts don't fit.
    legend = list(batched([p for p in prod.parts if p.boxes], 2))
    chunks = [legend[:LEGEND_FIRST_PAGE]] + list(batched(legend[LEGEND_FIRST_PAGE:], LEGEND_PER_PAGE))
    pages += _pages("מבט מפוצץ", chunks, "exploded", svg=drawings.exploded_view(prod))

    # Materials, hardware and the estimate.
    boards = [{"board": prod.boards[key], "sheets": n, "edge": prod.edge_m.get(key),
               "uses": ", ".join(dict.fromkeys(p.group for p in prod.parts if p.board.key == key))}
              for key, n in nesting.by_board.items()]
    pages.append({"kind": "materials", "title": "חומרים ופרזול", "toc": True, "method": prod.method, "boards": boards,
                  "hardware": prod.hardware})
    pages.append({"kind": "estimate", "title": "אומדן עלות חומרים", "toc": True, "est": est, "vat": round(VAT * 100)})

    # Cut list by group, then the sheets two to a page.
    rows: list[dict] = []
    for group in GROUPS:
        members = sorted((p for p in prod.parts if p.group == group), key=lambda p: p.no)
        if members:
            rows.append({"group": group})
            rows += [{"part": p, "glyph": drawings.edge_glyph(p)} for p in members]
    pages += _pages("רשימת חיתוך", row_pages(rows, CUT_ROWS_PER_PAGE), "cutlist", count=count)

    sheets = [drawings.sheet_drawing(s, parts_by_no, uid=f"sh{k}") for k, s in enumerate(nesting.sheets)]
    pages += _pages("שיבוץ לוחות", list(batched(sheets, 2)) or [()], "nesting", nesting=nesting,
                    oversize=", ".join(f"#{no}" for no, _ in nesting.oversize))

    # Site checks, then the advisories with the closing declaration.
    pages.append(_site(design, lay, prod))
    pages += _pages("הערות הייעוץ", list(batched(adv, ADVICE_PER_PAGE)) or [()], "advice")
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
    return {"kind": "cover", "title": "שער", "toc": False, "cls": "cover",
            # The render when the customer made one; otherwise the front elevation.
            "image": f"data:image/png;base64,{base64.b64encode(render_png).decode()}" if render_png else None,
            "drawing": None if render_png else drawings.front_elevation(design, lay, catalog, uid="cv"),
            "spec": [("רוחב", f"{cm(lay.width)} ס״מ"), ("גובה", f"{cm(lay.height)} ס״מ"), ("עומק", f"{cm(lay.depth)} ס״מ"),
                     ("תאים", str(len(lay.ranges))),
                     ("דלתות", DOOR_LABELS[doors_type] + (f" · {len(lay.doors)}" if lay.doors else "")),
                     ("ידיות", f"{HANDLE_LABELS[handles['style']]} · {HANDLE_FINISHES[handles['finish']]}"),
                     ("גוף", carcass.name), ("חזיתות", fronts.name if doors_type != "none" else "—")],
            "range": f"{shekel(est.lo_vat)}–{shekel(est.hi_vat)}",
            "summary": f"כולל מע״מ · {len(nesting.sheets)} לוחות · {count} חלקים",
            "warnings": (("אזהרה פתוחה אחת" if warn == 1 else f"{warn} אזהרות פתוחות") + ", פירוט בעמודי הייעוץ"
                         if warn else "אין אזהרות פתוחות. הערות מידע בעמודי הייעוץ.")}


def _site(design: dict, lay: Layout, prod: Production) -> dict:
    site, doors_type = design["site"] or {}, design["doors"]["type"]
    ceiling, niche = site.get("ceiling"), site.get("niche")
    diagonal = math.hypot(lay.height, lay.depth)  # a carcass raised from lying down pivots on this [97]
    hinged_widths = [d.width for d in lay.doors] if doors_type == "hinged" else []
    return {"kind": "site", "title": "אתר ובדיקות", "toc": True, "ceiling": ceiling, "niche": niche,
            "filler": max(0, (niche - lay.width) / 2) if niche else None, "diagonal": diagonal,
            "lift_ok": diagonal + 10 <= ceiling if ceiling else None, "anchors": prod.anchors,
            "reach": max(hinged_widths) if hinged_widths else None,
            "reach_label": {"sliding": "הזזה, ללא", "none": "ללא דלתות"}.get(doors_type, ""),
            "checks": _checks(lay, diagonal)}


def _checks(lay: Layout, diagonal: float) -> list[str]:
    return [
        "רוחב בשלושה גבהים. הקטן קובע.", "גובה בשלוש נקודות, ופילוס רצפה ותקרה.", "אנך הקירות ואלכסוני הנישה.",
        "פנלים, שקעים, מזגן, צנרת ותאורה בתחום הארון.", "סוג הקיר לעיגון, וסריקת כבלים.", "מסלול הכנסה מול החלק הגדול ביותר.",
        f"אלכסון הרמה {half_up(diagonal)} מ״מ מול התקרה וגופי התאורה.", "לחות: קיר חיצוני או סמוך לחדר רחצה.",
        f"מלאי הלוח אצל הספק: {lay.panel} מ״מ בכל הגוונים.", "זמינות לוח 16 מ״מ לתיבות המגירה.",
        "מרווח 2 ס״מ לפחות לדלת ציר ליד קיר.", "עיגון לשלד ולא לגב. מספר העוגנים לפי הרוחב.",
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


def _environment() -> Environment:
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True, undefined=StrictUndefined,
                      trim_blocks=True, lstrip_blocks=True)
    env.filters.update(mm=half_up, cm=cm, shekel=shekel, swatch=_swatch, ltr=ltr_runs)
    env.globals["css"] = Markup((TEMPLATES / "dossier.css").read_text(encoding="utf-8"))  # our own static file
    return env


_env = _environment()


def render_html(context: dict) -> str:
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


def render_pdf(design: dict, catalog: dict, render_png: bytes | None = None, today: date | None = None) -> bytes:
    return html_to_pdf(render_html(build(design, catalog, render_png, today)))
