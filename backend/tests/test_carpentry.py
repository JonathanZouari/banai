import base64
import copy
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.carpentry import MAX_IMAGE_SIDE
from app.domain.apply import apply_ops
from app.domain.carpentry import build_plan, hinge_count, hinge_positions, runner_length
from app.domain.carpentry_defaults import CARPENTRY_DEFAULTS as C
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.main import app

client = TestClient(app)
CATALOG = load_catalog()


def parts(plan, kind):
    return [p for p in plan["parts"] if p["kind"] == kind]


def png_url(size=(320, 240)) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", size, (240, 230, 220)).save(buffer, "PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


# ---- build_plan -------------------------------------------------------------------------

def test_carcass_parts_reconcile_with_the_overall_width():
    design = basic_wardrobe()
    plan = build_plan(design, CATALOG)
    (side,), (top,) = parts(plan, "side"), parts(plan, "top_bottom")
    assert side["qty"] == 2 and side["length"] == 2400 and side["width"] == 600
    assert top["length"] + 2 * side["thickness"] == design["dimensions"]["width"]
    assert len(parts(plan, "partition")) == 2
    assert sum(p["qty"] for p in parts(plan, "shelf")) == 7
    assert plan["counts"] == {"shelves": 7, "drawers": 2, "rails": 1, "doors": 3, "partitions": 2}


def test_every_part_has_positive_integer_dimensions():
    for part in build_plan(basic_wardrobe(), CATALOG)["parts"]:
        assert part["qty"] >= 1
        for key in ("length", "width", "thickness"):
            assert isinstance(part[key], int) and part[key] > 0


def test_hinged_doors_cover_the_front_with_gaps():
    plan = build_plan(basic_wardrobe(), CATALOG)
    doors = parts(plan, "door")
    total = sum(d["width"] for d in doors) + 2 * C["doorGap"] * len(doors)
    assert total == 2000
    assert all(d["length"] == 2400 - 2 * C["doorGap"] for d in doors)


def test_one_door_spanning_two_compartments():
    design = apply_ops(basic_wardrobe(), [{"op": "configure_doors", "type": "hinged", "doors": [
        {"compartmentIds": ["cmp_left", "cmp_middle"], "hingeSide": "left", "id": "dr_a"},
        {"compartmentIds": ["cmp_right"], "hingeSide": "right", "id": "dr_b"}]}], CATALOG)
    wide, narrow = parts(build_plan(design, CATALOG), "door")
    assert wide["width"] > narrow["width"] * 1.9
    assert wide["params"]["compartments"] == [1, 2]


def test_sliding_doors_overlap():
    design = apply_ops(basic_wardrobe(), [{"op": "configure_doors", "type": "sliding", "count": 3}], CATALOG)
    plan = build_plan(design, CATALOG)
    (panel,) = parts(plan, "sliding_door")
    assert panel["qty"] == 3 and panel["width"] * 3 >= 2000 + 2 * C["slidingOverlap"]
    assert panel["length"] == 2400 - C["slidingHeightReduction"]
    assert {"kind": "sliding_track", "size": 2000, "qty": 1} in plan["hardware"]
    assert not parts(plan, "door")


def test_hinges_and_runners_follow_the_tables():
    assert [hinge_count(h) for h in (800, 900, 1500, 1900, 2396)] == [2, 2, 3, 4, 5]
    positions = hinge_positions(2396, C["hingeEdgeOffset"])
    assert positions[0] == 100 and positions[-1] == 2296 and len(positions) == 5
    assert runner_length(600, 50) == 550 and runner_length(450, 50) == 400 and runner_length(200, 50) == 150


def test_custom_and_override_materials_are_named():
    design = apply_ops(basic_wardrobe(), [
        {"op": "set_material", "target": "doors", "color": {"custom": True, "name": "Sage green", "hex": "#9caf88"}},
        {"op": "set_material", "target": "shf_l1", "color": {"catalogId": "walnut"}},
    ], CATALOG)
    plan = build_plan(design, CATALOG)
    assert "Sage green" in plan["materials"]["doors"]
    assert any("Walnut" in p["material"] for p in parts(plan, "shelf"))


def test_build_plan_never_mutates_its_input():
    design = basic_wardrobe()
    before = copy.deepcopy(design)
    build_plan(design, CATALOG)
    assert design == before


# ---- POST /api/carpentry/pdf -------------------------------------------------------------

def post(**overrides):
    body = {"design": basic_wardrobe(), "revision": 4, "language": "en",
            "images": {"closed": png_url(), "open": png_url()}, **overrides}
    return client.post("/api/carpentry/pdf", json=body)


@pytest.mark.parametrize("language", ["en", "he"])
def test_pdf_is_returned_as_a_download(language):
    response = post(language=language)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'attachment; filename="banai-carpenter-r4.pdf"'
    assert response.content.startswith(b"%PDF-") and len(response.content) > 10_000


def test_pdf_without_images_still_works():
    assert post(images={}).status_code == 200


@pytest.mark.parametrize("bad", [
    "data:image/jpeg;base64,AAAA",
    "data:image/png;base64,not-base64!!",
    "data:image/png;base64," + base64.b64encode(b"GIF89a" + b"\0" * 100).decode(),
    png_url((MAX_IMAGE_SIDE + 1, 10)),
])
def test_invalid_images_are_rejected(bad):
    response = post(images={"closed": bad})
    assert response.status_code == 422 and response.json()["error"]["code"] == "BAD_IMAGE"


def test_invalid_design_is_rejected():
    design = basic_wardrobe()
    design["dimensions"]["width"] = 1
    response = post(design=design)
    assert response.status_code == 422 and response.json()["success"] is False


def test_unknown_fields_are_rejected():
    assert post(extra=True).status_code == 422
