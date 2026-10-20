"""The dossier in Hebrew, English, Russian and Arabic (ADR-029): a complete catalog, no Hebrew left in a foreign
dossier, the page direction, the API parameter, and the workspace untouched (it stays Hebrew)."""

import ast
import re
from datetime import date
from pathlib import Path
from string import Formatter

import pytest
from fastapi.testclient import TestClient

from app import i18n
from app.advice.rules import advisories
from app.api.dossier import get_pdf_renderer
from app.domain.defaults import basic_wardrobe
from app.dossier.render import build, html_to_pdf, render_html
from app.i18n import LANGUAGES, language, long_date, tr
from app.i18n_catalog import CATALOG
from app.main import app

from tests.production.samples import CATALOG as DESIGN_CATALOG
from tests.production.samples import DESIGNS, hinged, make, sliding

# More variants: every handle style, a heavy mirror door, painted MDF, veneer, 18 mm, site checks, inserts.
VARIANTS = {
    **DESIGNS,
    **{f"handles-{style}": (lambda s=style: make(hinged(2), {"op": "set_handles", "target": "all", "style": s, "finish": "brass"},
                                                 {"op": "add_drawer", "compartmentId": "cmp_a", "y": 0, "height": 200, "id": "drw_x"}))
       for style in ("bar", "knob", "edge", "cup", "groove", "none")},
    "mirror-heavy": lambda: make(hinged(2), {"op": "modify_door", "id": "dr_a", "mirror": True}, height=2600, width=1300),
    "mdf": lambda: make(hinged(2), {"op": "set_material", "target": "doors", "material": {"catalogId": "lacquered_mdf"}}),
    "veneer-18": lambda: make(hinged(2), {"op": "set_material", "target": "carcass", "material": {"catalogId": "oak_veneer"}}, panel=18),
    "low-ceiling": lambda: make(hinged(2), {"op": "set_site", "ceiling": 2420, "niche": 1810}),
    "too-tall": lambda: make(hinged(2), {"op": "set_site", "ceiling": 2300, "niche": 1700}),
    # Room elements: readings, clearance, and every R21/R22 advisory between them.
    "room-tight": lambda: make(hinged(2), {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_b"},
                               {"op": "set_site", "clearance": 400, "widths": [1900, 1870, None], "heights": [2600, 2570, 2590]}),
    "room-pass": lambda: make(hinged(2), {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_b"}, {"op": "set_site", "clearance": 950}),
    "room-slide": lambda: make(sliding(2), {"op": "set_site", "clearance": 550, "heights": [2600, 2580, None]}),
    "room-tight-hinged": lambda: make(hinged(2), {"op": "set_site", "clearance": 700}),
    # Legs and soft close: R24, the leg hardware and method line, and the plain hinges and runners.
    "legs-plain": lambda: make(hinged(2), {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_l"},
                               {"op": "set_fittings", "base": "legs", "softClose": False}, plinth=120),
    "legs-low": lambda: make(hinged(2), {"op": "set_fittings", "base": "legs"}),
    "child-locked": lambda: make(hinged(2), {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_c"},
                                 {"op": "set_household", "people": [{"height": 1780}, {"height": 1100}]},
                                 {"op": "set_fittings", "childLock": True, "releaseHeight": 1300}),
    "child-open": lambda: make(hinged(2), {"op": "set_household", "people": [{"height": 1000}]}),
    "screens": lambda: make(hinged(3), {"op": "add_insert", "compartmentId": "cmp_a", "type": "tv", "height": 809, "id": "ins_t1"},
                            {"op": "add_insert", "compartmentId": "cmp_b", "type": "tv", "height": 448, "id": "ins_t2"},
                            {"op": "add_insert", "compartmentId": "cmp_c", "type": "tv", "height": 374, "id": "ins_t3"}, count=3, width=2700),
    "room-obstacles": lambda: make(hinged(2), {"op": "set_site", "obstacles": [{"type": "socket", "x": 300, "y": 300, "width": 80, "height": 80}, {"type": "ac", "x": 200, "y": 2000, "width": 900, "height": 300}, {"type": "pipe", "x": 1200, "y": 200, "width": 60, "height": 400}, {"type": "panel", "x": -200, "y": 0, "width": 2400, "height": 80}, {"type": "window", "x": 3000, "y": 900, "width": 1200, "height": 1300}]}),
    "room-obstacles-slide": lambda: make(sliding(2), {"op": "set_site", "obstacles": [{"type": "switch", "x": 100, "y": 1000, "width": 80, "height": 80}, {"type": "window", "x": 0, "y": 2000, "width": 900, "height": 600}]}),
    "room-obstacle-other": lambda: make(hinged(2), {"op": "set_site", "obstacles": [{"type": "other", "name": "Radiator", "x": 300, "y": 150, "width": 800, "height": 600}]}),
    "room-l": lambda: make(hinged(2), {"op": "set_room", "shape": {"kind": "l", "width": 4500, "depth": 4000, "cutWidth": 1500, "cutDepth": 1500}, "wall": 0, "offset": 0}),
    "room-recess": lambda: make(hinged(2), {"op": "set_room", "shape": {"kind": "recess", "width": 4000, "depth": 3500, "recessX": 1000, "recessWidth": 2000, "recessDepth": 700}}),
    # Openings (ADR-037 stage 3): the floor-plan page with every kind of opening, and every R27 opening advisory.
    "room-openings": lambda: make(hinged(2), {"op": "set_room", "shape": {"kind": "rect", "width": 3500, "depth": 4000}, "offset": 300, "openings": [
        {"type": "door", "wall": 3, "at": 3300, "width": 500, "height": 2100, "swing": "out"},
        {"type": "window", "wall": 0, "at": 1000, "width": 800, "height": 400},
        {"type": "door", "wall": 3, "at": 2400, "width": 800, "height": 2100},
        {"type": "passage", "wall": 2, "at": 1000, "width": 900, "height": 2100}]}),
    "room-openings-blocked": lambda: make(hinged(2), {"op": "set_room", "shape": {"kind": "rect", "width": 3500, "depth": 4000}, "offset": 0, "openings": [
        {"type": "door", "wall": 0, "at": 1500, "width": 800, "height": 2100},
        {"type": "passage", "wall": 3, "at": 3300, "width": 700, "height": 2100},
        {"type": "door", "wall": 1, "at": 300, "width": 900, "height": 2100}]}),
    "room-openings-pass": lambda: make(hinged(2), {"op": "set_room", "shape": {"kind": "l", "width": 4500, "depth": 4000, "cutWidth": 1500, "cutDepth": 1500}, "wall": 5, "offset": 1900, "openings": [
        {"type": "passage", "wall": 0, "at": 0, "width": 800, "height": 2100},
        {"type": "window", "wall": 3, "at": 500, "width": 1200, "height": 1300, "sill": 600}]}),
    "room-furniture": lambda: make(hinged(2), {"op": "set_room", "shape": {"kind": "rect", "width": 4000, "depth": 4000}, "furniture": [{"type": "bed", "x": 2000, "y": 2600, "width": 1600, "depth": 2000, "height": 550}, {"type": "mirror", "x": 3500, "y": 1500, "width": 700, "depth": 60, "height": 1700, "rotation": 90}]}),
    "pulldown-wide": lambda: make({"op": "add_insert", "compartmentId": "cmp_a", "type": "pulldown", "id": "ins_pw"}, count=1, width=1400),
    "led-many": lambda: make({"op": "add_insert", "compartmentId": "cmp_a", "type": "led", "id": "ins_l1"},
                             {"op": "add_insert", "compartmentId": "cmp_b", "type": "led", "id": "ins_l2"}),
}

HEBREW = re.compile("[֐-׿]")
PLACEHOLDER = re.compile(r"\{(\w+)\}")
FOREIGN = ("en", "ru", "ar")


def test_every_entry_has_all_three_languages_with_the_same_placeholders():
    assert len(CATALOG) > 200
    for source, entry in CATALOG.items():
        assert HEBREW.search(source), source
        for lang in FOREIGN:
            text = entry.get(lang)
            assert text and text.strip(), (source, lang)
            assert not HEBREW.search(text), (source, lang, text)
            assert sorted(PLACEHOLDER.findall(text)) == sorted(PLACEHOLDER.findall(source)), (source, lang, text)
            assert text[: len(text) - len(text.lstrip())] == source[: len(source) - len(source.lstrip())], (source, lang)


@pytest.mark.parametrize("lang", FOREIGN)
@pytest.mark.parametrize("name", sorted(VARIANTS))
def test_a_foreign_dossier_has_no_hebrew_left(name, lang):
    i18n.MISSING.clear()
    context = build(VARIANTS[name](), DESIGN_CATALOG, None, date(2026, 10, 17), lang)
    html = render_html(context)
    assert i18n.MISSING == set(), sorted(i18n.MISSING)[:5]
    leftovers = sorted({m.group() for m in HEBREW.finditer(html)})
    assert leftovers == [], (name, lang, html[max(0, html.find(leftovers[0]) - 80): html.find(leftovers[0]) + 80])
    rtl = lang == "ar"
    assert f'<html lang="{lang}" dir="{"rtl" if rtl else "ltr"}">' in html


def test_the_hebrew_dossier_is_unchanged_and_right_to_left():
    html = render_html(build(DESIGNS["rich"](), DESIGN_CATALOG, None, date(2026, 10, 17)))
    assert '<html lang="he" dir="rtl">' in html
    assert "תיק נגר" in html and "רשימת חיתוך" in html and "17 באוקטובר 2026" in html


def test_dates_and_titles_read_naturally():
    day = date(2026, 10, 17)
    assert [long_date(day, lang) for lang in LANGUAGES] == ["17 באוקטובר 2026", "October 17, 2026", "17 октября 2026",
                                                             "17 أكتوبر 2026"]
    with language("en"):
        assert tr("רשימת חיתוך") == CATALOG["רשימת חיתוך"]["en"]
        assert tr("HDF") == "HDF"  # no Hebrew: nothing to translate
    assert tr("רשימת חיתוך") == "רשימת חיתוך"  # outside a dossier everything stays Hebrew


def test_the_workspace_advisories_stay_hebrew():
    items = advisories(basic_wardrobe(), DESIGN_CATALOG)
    assert items and all(HEBREW.search(a["title"]) for a in items)
    with language("ru"):
        russian = advisories(basic_wardrobe(), DESIGN_CATALOG)
    assert [a["id"] for a in russian] == [a["id"] for a in items]
    assert not any(HEBREW.search(a["title"] + a["body"] + a["grade"]) for a in russian)


def test_an_unknown_language_is_refused():
    with pytest.raises(ValueError), language("fr"):
        pass


def test_the_api_takes_the_language_and_names_the_file_after_it():
    calls = []
    app.dependency_overrides[get_pdf_renderer] = lambda: lambda *args, **kwargs: calls.append(kwargs) or b"%PDF-1.7 fake"
    try:
        client = TestClient(app)
        hebrew = client.post("/api/dossier", json={"design": basic_wardrobe()})
        arabic = client.post("/api/dossier", json={"design": basic_wardrobe(), "language": "ar"})
        refused = client.post("/api/dossier", json={"design": basic_wardrobe(), "language": "fr"})
    finally:
        app.dependency_overrides.clear()
    assert hebrew.headers["content-disposition"] == 'attachment; filename="banai-dossier.pdf"'
    assert arabic.headers["content-disposition"] == 'attachment; filename="banai-dossier-ar.pdf"'
    assert calls == [{}, {"lang": "ar"}]
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "INVALID_REQUEST"


def test_an_arabic_pdf_renders_in_chromium():
    pdf = html_to_pdf(render_html(build(DESIGNS["rich"](), DESIGN_CATALOG, None, date(2026, 10, 17), "ar")))
    assert pdf.startswith(b"%PDF-") and len(pdf) > 50_000


def test_placeholders_are_plain_names_in_every_translation():
    """Security review (ADR-029): no attribute access, conversion or format spec can hide in a translation."""
    for source, entry in CATALOG.items():
        for text in (source, *entry.values()):
            for _, field, spec, conversion in Formatter().parse(text):
                if field is not None:
                    assert field.isidentifier() and not spec and conversion is None, (source, text)


def test_a_template_with_params_is_always_a_literal():
    """Customer text may be a param, never the template: tr()/t() with keyword args take a string literal."""
    app_dir = Path(__file__).resolve().parents[2] / "app"
    offenders = []
    for path in app_dir.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) in ("tr", "_t") and node.keywords:
                if not (node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                    offenders.append(f"{path.name}:{node.lineno}")
    assert offenders == []
    for path in (app_dir / "dossier" / "templates").rglob("*.j2"):
        for m in re.finditer(r"\bt\(\s*([^\"'\s)])", path.read_text(encoding="utf-8")):  # a call, not "t()" in a comment
            offenders.append(f"{path.name}: t({m.group(1)}...")
    assert offenders == []


def test_a_broken_translation_fails_as_a_render_error(monkeypatch):
    from app.dossier import render
    from app.dossier.render import RenderError, render_pdf

    monkeypatch.setattr(render, "html_to_pdf", lambda html: pytest.fail("never reaches Chromium"))
    monkeypatch.setitem(CATALOG, "עמוד {no} מתוך {total}", {"en": "Page {no} of {missing}", "ru": "x", "ar": "x"})
    with pytest.raises(RenderError):
        render_pdf(basic_wardrobe(), DESIGN_CATALOG, None, date(2026, 10, 17), "en")
