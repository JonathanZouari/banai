"""Pull-down hanging rail (wardrobe lift): a rail `type`, saved with the design and shown in the PDF."""

import copy
import io

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.agent.prompts import build_system_prompt
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.schema import parse_design
from app.export.layout import component_rows, compartment_items
from app.main import app
from tests.domain.conftest import load_design

CATALOG = load_catalog()
LIFT = [{"op": "add_rail", "compartmentId": "cmp_left", "y": 2000, "id": "rail_lift", "type": "pulldown"}]


def test_designs_saved_before_the_type_existed_still_load_as_fixed_rails():
    legacy = copy.deepcopy(load_design("basic"))
    for compartment in legacy["compartments"]:
        for rail in compartment["rails"]:
            del rail["type"]
    canonical = parse_design(legacy)
    assert [r["type"] for c in canonical["compartments"] for r in c["rails"]] == ["fixed"]
    assert canonical == load_design("basic")


def test_export_layout_marks_the_lift():
    design = apply_ops(load_design("basic"), LIFT, CATALOG)
    lift = next(item for item in compartment_items(design, 0) if item.kind == "rail")
    assert lift.pulldown is True
    assert next(row for row in component_rows(design) if row.code == lift.code).pulldown is True
    fixed = next(item for item in compartment_items(design, 1) if item.kind == "rail")
    assert fixed.pulldown is False


def test_carpenter_pdf_names_the_pull_down_rail():
    design = apply_ops(load_design("basic"), LIFT, CATALOG)
    response = TestClient(app).post("/api/export/pdf", json={"design": design, "language": "en"})
    assert response.status_code == 200
    text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages)
    assert "pull-down hanging rail" in text
    assert "Pull-down rail (wardrobe lift)" in text
    hebrew = TestClient(app).post("/api/export/pdf", json={"design": design, "language": "he"})
    assert hebrew.status_code == 200


def test_the_agent_is_told_about_the_rail_type():
    prompt = build_system_prompt(load_design("basic"), CATALOG, "en")
    assert '"pulldown"' in prompt and "modify_rail: id, y?, type?" in prompt
