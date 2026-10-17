"""The dossier: page structure (pure) and the offline Chromium PDF (smoke)."""

import io
import re
from datetime import date

import pytest
from pypdf import PdfReader

from app.domain.defaults import basic_wardrobe
from app.dossier.render import RenderError, build, hebrew_date, html_to_pdf, render_html, render_pdf, row_pages
from tests.production.samples import CATALOG, DESIGNS, make, png

KINDS = ["cover", "front", "interior", "exploded", "materials", "estimate", "cutlist", "nesting", "site", "advice"]


def test_pages_follow_the_prototype_order_and_number_themselves():
    ctx = build(basic_wardrobe(), CATALOG, today=date(2026, 10, 17))
    kinds = [p["kind"] for p in ctx["pages"]]
    assert list(dict.fromkeys(kinds)) == KINDS
    assert [p["no"] for p in ctx["pages"]] == list(range(1, len(kinds) + 1))
    assert [title for title, _ in ctx["toc"]] == ["חזית ותוכנית", "פנים", "מבט מפוצץ", "חומרים ופרזול", "אומדן עלות חומרים",
                                                  "רשימת חיתוך", "שיבוץ לוחות", "אתר ובדיקות", "הערות הייעוץ"]
    assert ctx["meta"]["date"] == "17 באוקטובר 2026" == hebrew_date(date(2026, 10, 17))
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
