"""Carpenter PDF: drawing number and status (ISO 7200 title-block fields), the standards and
responsibility notes (SI 5555, named but never claimed), and the interior-by-compartment table."""

import io
from datetime import date

from pypdf import PdfReader

from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.export.pdf import Document, drawing_number, render_pdf
from tests.domain.conftest import load_design

TODAY = date(2026, 10, 29)


def pages_of(pdf: bytes) -> list[str]:
    return [page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages]


def flat(pdf: bytes) -> str:
    """All the text on one line: the wrap can split "SI 5555" or a sentence across lines."""
    return " ".join(" ".join(pages_of(pdf)).split())


def render(design: dict, language: str) -> bytes:
    return render_pdf(design, load_catalog(), language, TODAY)


def test_the_drawing_number_follows_the_design_only():
    design = load_design("basic")
    number = drawing_number(design)
    assert number.startswith("BA-") and len(number) == 11
    assert drawing_number(load_design("basic")) == number  # the same design, the same number
    wider = apply_ops(design, [{"op": "update_dimensions", "width": 2100}], load_catalog())
    assert drawing_number(wider) != number  # any change, a new number


def test_every_sheet_carries_the_drawing_number_and_the_status():
    design = load_design("basic")
    number = drawing_number(design)
    pages = pages_of(render(design, "en"))
    assert all(number in page for page in pages)
    assert all("not for production" in page for page in pages)


def test_the_standards_notes_name_si_5555_in_every_language():
    design = load_design("basic")
    number = drawing_number(design)
    english = flat(render(design, "en"))
    assert "Standards and responsibility" in english
    assert "SI 5555" in english
    assert "does not certify compliance" in english
    assert f"Drawing number {number}" in english
    spanish = flat(render(design, "es"))
    assert "Normas y responsabilidad" in spanish and "SI 5555" in spanish
    hebrew = flat(render(design, "he"))
    assert "5555" in hebrew and number in hebrew


def test_the_pdf_never_claims_compliance_or_production_approval():
    design = load_design("basic")
    for language, claims in {
        "en": ("complies with", "compliant with", "approved for production", "certified to"),
        "es": ("cumple la norma", "cumple con la norma", "aprobado para producción", "certificado según"),
        "he": ("תואם לתקן", "עומד בתקן", "מאושר לייצור"),
    }.items():
        text = flat(render(design, language))
        for claim in claims:
            assert claim not in text, (language, claim)
            assert claim[::-1] not in text, (language, claim)  # pypdf may return RTL text in visual order


def test_the_interior_table_lists_every_item_with_its_height():
    design = load_design("basic")
    document = Document(design, load_catalog(), "en", TODAY)
    rows = document.interior_rows()
    assert [row[0] for row in rows] == ["A", "B", "C"][: len(design["compartments"])]
    for row, compartment in zip(rows, design["compartments"]):
        assert row[1] == str(compartment["width"])
        for cell, key in zip(row[2:], ("shelves", "drawers", "rails")):
            count = len(compartment[key])
            assert cell == "—" if count == 0 else cell.startswith(f"{count}: ")
    text = flat(document.build())
    assert "Interior by compartment" in text
    assert "A-S1 at" in text
    assert "(front " in text


def test_the_interior_table_paginates_for_the_largest_design():
    catalog = load_catalog()
    design = apply_ops(None, [{"op": "create_wardrobe", "width": 6000, "height": 3500, "depth": 1200,
                               "compartmentCount": 20}], catalog)
    ops = [{"op": "add_shelf", "compartmentId": c["id"], "y": 100 + n * 200, "thickness": 5}
           for c in design["compartments"] for n in range(15)]
    for start in range(0, len(ops), 100):
        design = apply_ops(design, ops[start:start + 100], catalog)
    pages = Document(design, catalog, "he", TODAY).pages_interior()
    assert len(pages) >= 2  # 20 long rows do not fit on one sheet
    text = "\n".join(pages_of(render_pdf(design, catalog, "he", TODAY)))
    assert text.count("5555") >= 1
