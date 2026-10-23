"""The carpenter PDF names the new catalog colours and material correctly, in both languages."""

import io
from datetime import date

from pypdf import PdfReader

from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.export.pdf import Document, render_pdf
from tests.domain.conftest import load_design

NEW_LOOK = [
    {"op": "set_material", "target": "carcass", "material": {"catalogId": "solid_wood"}, "color": {"catalogId": "olive_green"}},
    {"op": "set_material", "target": "doors", "color": {"catalogId": "dusty_blue"}},
    {"op": "set_material", "target": "shf_l1", "color": {"catalogId": "sand_beige"}},
]


def pdf_text(language: str, ops: list[dict]) -> str:
    design = apply_ops(load_design("basic"), ops, load_catalog())
    pdf = render_pdf(design, load_catalog(), language, date(2026, 10, 23))
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)


def test_english_pdf_shows_the_catalog_names():
    text = pdf_text("en", NEW_LOOK)
    for name in ("Olive green", "Dusty blue", "Sand beige", "Solid wood"):
        assert name in text, name
    baseline = pdf_text("en", [])
    assert not any(name in baseline for name in ("Olive green", "Dusty blue", "Sand beige", "Solid wood"))


def test_hebrew_pdf_resolves_the_hebrew_names_and_colours():
    document = Document(apply_ops(load_design("basic"), NEW_LOOK, load_catalog()), load_catalog(), "he", date(2026, 10, 23))
    names = {
        ("color", "olive_green"): "ירוק זית",
        ("color", "dusty_blue"): "כחול אבק",
        ("color", "sand_beige"): "בז' חול",
        ("material", "solid_wood"): "עץ מלא",
    }
    for (field, catalog_id), hebrew in names.items():
        assert document.ref_name(field, {"catalogId": catalog_id}) == hebrew
    assert document.hex_of({"color": {"catalogId": "olive_green"}}) == "#6b7a47"
    assert pdf_text("he", NEW_LOOK)  # the Hebrew document renders end to end


def test_english_names_come_from_the_catalog():
    document = Document(load_design("basic"), load_catalog(), "en", date(2026, 10, 23))
    assert document.ref_name("color", {"catalogId": "olive_green"}) == "Olive green"
