"""The dossier: page structure (pure) and the offline Chromium PDF (smoke)."""

import io
import re
from datetime import date

import pytest
from pypdf import PdfReader

from app.domain.defaults import basic_wardrobe
from app.dossier.render import RenderError, build, html_to_pdf, render_html, render_pdf, row_pages
from app.i18n import long_date
from tests.production.samples import CATALOG, DESIGNS, hinged, make, png

KINDS = ["cover", "front", "interior", "exploded", "materials", "estimate", "cutlist", "nesting", "site", "advice"]


def test_pages_follow_the_prototype_order_and_number_themselves():
    ctx = build(basic_wardrobe(), CATALOG, today=date(2026, 10, 17))
    kinds = [p["kind"] for p in ctx["pages"]]
    assert list(dict.fromkeys(kinds)) == KINDS
    assert [p["no"] for p in ctx["pages"]] == list(range(1, len(kinds) + 1))
    assert [title for title, _ in ctx["toc"]] == ["חזית ותוכנית", "פנים", "מבט מפוצץ", "חומרים ופרזול", "אומדן עלות חומרים",
                                                  "רשימת חיתוך", "שיבוץ לוחות", "אתר ובדיקות", "הערות הייעוץ"]
    assert ctx["meta"]["date"] == "17 באוקטובר 2026" == long_date(date(2026, 10, 17), "he")
    assert ctx["meta"]["id"].startswith("BN-") and ctx["meta"]["id"] == build(basic_wardrobe(), CATALOG)["meta"]["id"]


def test_long_designs_paginate():
    design = make(*[{"op": "add_shelf", "compartmentId": f"cmp_{chr(97 + i)}", "y": 300 + 7 * i, "id": f"shf_{i}"}
                    for i in range(9)], width=4500, count=9)
    pages = build(design, CATALOG)["pages"]
    interior = [p for p in pages if p["kind"] == "interior"]
    assert [len(p["chunk"]) for p in interior] == [4, 5]  # 4 under the full elevation, then up to 8 a page
    assert [p["title"] for p in interior] == ["פנים (1)", "פנים (2)"]
    cut = [p for p in pages if p["kind"] == "cutlist"]
    assert all(len(p["chunk"]) <= 30 for p in cut)


def test_a_cut_list_page_never_ends_on_a_group_heading():
    rows = [{"group": "a"}] + [{"part": k} for k in range(28)] + [{"group": "b"}, {"part": 28}, {"part": 29}]
    pages = row_pages(rows, 30)
    assert [len(p) for p in pages] == [29, 3] and pages[1][0] == {"group": "b"}
    assert row_pages([], 30) == [[]]


def test_the_cover_uses_the_render_or_the_front_elevation():
    with_png = build(basic_wardrobe(), CATALOG, png(4, 3))["pages"][0]
    assert with_png["image"].startswith("data:image/png;base64,iVBORw0KGgo") and with_png["drawing"] is None
    without = build(basic_wardrobe(), CATALOG)["pages"][0]
    assert without["image"] is None and "<svg" in str(without["drawing"])


def test_the_html_references_nothing_outside_the_page():
    html = render_html(build(DESIGNS["rich"](), CATALOG, png(2, 2)))
    assert re.findall(r'(?:src|href)="([^"]*)"', html) == [re.search(r'src="(data:image/png;base64,[^"]+)"', html)[1]]
    assert set(re.findall(r"https?://[^\"' )]+", html)) == {"http://www.w3.org/2000/svg"}  # a namespace, never fetched
    assert "<script" not in html and "<link" not in html and "@import" not in html


def test_pdf_smoke():
    ctx = build(basic_wardrobe(), CATALOG, today=date(2026, 10, 17))
    seen: list[tuple[str, bool]] = []
    pdf = html_to_pdf(render_html(ctx), seen)
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) == len(ctx["pages"])  # one A4 page per section, no spill-over
    assert 8 <= len(reader.pages) <= 40
    first = reader.pages[0].extract_text()
    assert "תיק נגר" in first and "בנאי" in first
    assert "רשימת חיתוך" in reader.pages[6].extract_text()
    assert all(allowed for _, allowed in seen)  # nothing outside the page was even attempted


def test_render_pdf_with_a_cover_image():
    pdf = render_pdf(DESIGNS["rich"](), CATALOG, png(8, 6))
    assert pdf.startswith(b"%PDF") and len(PdfReader(io.BytesIO(pdf)).pages) >= 10


def test_chromium_blocks_every_request_that_leaves_the_page():
    html = ('<!doctype html><html dir="rtl"><head><meta charset="utf-8">'
            '<link rel="stylesheet" href="https://example.invalid/a.css">'
            '<style>body { background: url(http://example.invalid/bg.png) }</style></head>'
            '<body><p>שלום</p><img src="http://169.254.169.254/latest/meta-data/">'
            '<iframe src="http://localhost:8000/api/health"></iframe>'
            '<img src="data:image/png;base64,iVBORw0KGgo="></body></html>')
    seen: list[tuple[str, bool]] = []
    pdf = html_to_pdf(html, seen)
    assert pdf.startswith(b"%PDF")
    urls = {url: allowed for url, allowed in seen}
    assert urls["https://example.invalid/a.css"] is False
    assert urls["http://169.254.169.254/latest/meta-data/"] is False
    assert urls["http://localhost:8000/api/health"] is False
    assert not any(allowed for url, allowed in seen if not url.startswith(("data:", "about:")))


@pytest.mark.parametrize("timeout", [0.001, 0.05, 0.3])
def test_a_render_over_the_deadline_fails_cleanly(timeout):
    html = render_html(build(DESIGNS["rich"](), CATALOG))  # takes well over 0.3 s to load and print
    with pytest.raises(RenderError):
        html_to_pdf(html, timeout=timeout)


def test_a_zoned_dossier():
    """Left in thirds (a door, a pair, an open zone), right in halves: the zones reach every section."""
    ctx = build(DESIGNS["zones"](), CATALOG, today=date(2026, 10, 17))
    pages = {p["kind"]: p for p in reversed(ctx["pages"])}  # the first page of each kind
    assert [c["caption"] for c in pages["interior"]["chunk"]] == [
        "תא 1 · 3 אזורים, 3 מדפים · גבהים מהרצפה", "תא 2 · מדף, מוט · גבהים מהרצפה",
        "תא 3 · 2 אזורים, 2 מדפים, 2 מגירות · גבהים מהרצפה"]
    assert "כוסות הצירים" in pages["front"]["lead"] and "קווי האמצע של המדפים הקבועים" in pages["front"]["lead"]
    assert any(step.startswith("מדפים קבועים בין אזורים") for step in pages["materials"]["method"])
    advice = {a["id"] for page in ctx["pages"] if page["kind"] == "advice" for a in page["chunk"]}
    assert "r20-dividers" in advice
    pdf = html_to_pdf(render_html(ctx))
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) == len(ctx["pages"])  # nothing spills onto an extra page
    assert 8 <= len(reader.pages) <= 40
    text = "\n".join(page.extract_text() for page in reader.pages)
    assert "מדף קבוע" in text and "אזור" in text and "תיק נגר" in text


def test_the_household_and_the_child_locks_reach_the_dossier():
    design = make(hinged(), {"op": "set_household", "people": [{"name": "נועה", "height": 1050}, {"height": 1800}]},
                  {"op": "set_fittings", "childLock": True})
    html = render_html(build(design, CATALOG, None, date(2026, 10, 19)))
    assert "נועה 105 ס״מ · 180 ס״מ" in html
    assert "מנגנון שחרור מרכזי" in html and "לחצן בגובה 1500 מ״מ" in html


def test_the_site_page_lists_the_readings_and_the_clearance():
    design = make({"op": "set_site", "heights": [2600, 2570, None], "widths": [1900, 1870, 1880], "clearance": 650})
    html = render_html(build(design, CATALOG, None, date(2026, 10, 18)))
    assert "שמאל 2600 · אמצע 2570 · ימין —" in html
    assert "למעלה 1900 · באמצע 1870 · למטה 1880" in html
    assert "מרחב פנוי מול הארון" in html
    english = render_html(build(design, CATALOG, None, date(2026, 10, 18), "en"))
    assert "left 2600 · middle 2570 · right —" in english
    assert "Free space in front of the wardrobe" in english
    plain = render_html(build(make(), CATALOG, None, date(2026, 10, 18)))
    assert "<dt>גובה בשלוש נקודות</dt>" not in plain and "<dt>רוחב בשלושה גבהים</dt>" not in plain  # no readings, no rows


def test_the_site_page_lists_the_wall_obstacles():
    design = make({"op": "set_site", "obstacles": [{"type": "socket", "x": -300, "y": 300, "width": 80, "height": 80},
                                                    {"type": "ac", "x": 200, "y": 2100, "width": 900, "height": 300}]})
    html = render_html(build(design, CATALOG, None, date(2026, 10, 19)))
    assert "<dt>מכשולים בקיר</dt>" in html
    assert "שקע: -30 ס״מ מקצה הארון השמאלי, 30 ס״מ מהרצפה, 8×8 ס״מ" in html
    assert "מזגן: 20 ס״מ מקצה הארון השמאלי, 210 ס״מ מהרצפה, 90×30 ס״מ" in html
    russian = render_html(build(design, CATALOG, None, date(2026, 10, 19), "ru"))
    assert "Кондиционер: 20 см от левого края шкафа" in russian
    assert "<dt>מכשולים בקיר</dt>" not in render_html(build(make(), CATALOG, None, date(2026, 10, 19)))



def test_the_room_plan_page():
    room = {"op": "set_room", "shape": {"kind": "rect", "width": 3500, "depth": 4000}, "offset": 300, "openings": [
        {"type": "door", "wall": 1, "at": 300, "width": 900, "height": 2100, "hinge": "right"},
        {"type": "window", "wall": 0, "at": 2500, "width": 800, "height": 1200, "sill": 1000},
        {"type": "passage", "wall": 2, "at": 1000, "width": 900, "height": 2100}]}
    ctx = build(make(hinged(), room), CATALOG, None, date(2026, 10, 20))
    kinds = [p["kind"] for p in ctx["pages"]]
    assert kinds[kinds.index("site") + 1] == "room" and "תוכנית החדר" in [title for title, _ in ctx["toc"]]
    page = ctx["pages"][kinds.index("room")]
    assert [r["kind"] for r in page["rows"]] == ["דלת", "חלון", "מעבר"]
    assert page["rows"][0]["opens"] == "צירים מימין · נפתחת פנימה" and page["rows"][1]["sill"] == "100"
    svg = str(page["svg"])
    # The walls are cut where the openings are: 4 walls, 3 of them with one opening, so 7 pieces of wall.
    assert svg.count('class="cut"') == 7 and svg.count('class="ln-swing"') == 1
    assert "קיר 1 · 3500" in svg and "קיר 2 · 4000" in svg and ">ארון<" in svg
    html = render_html(ctx)
    assert "<h3>פתחים בחדר</h3>" in html
    english = render_html(build(make(hinged(), room), CATALOG, None, date(2026, 10, 20), "en"))
    assert "Room plan" in english and "hinges on the right · opens in" in english
    # No room, no plan; a room without openings says so.
    assert "room" not in [p["kind"] for p in build(make(hinged()), CATALOG)["pages"]]
    bare = render_html(build(make(hinged(), {"op": "set_room", "shape": {"kind": "rect", "width": 3500, "depth": 4000}}), CATALOG))
    assert "לא סומנו פתחים בחדר." in bare
