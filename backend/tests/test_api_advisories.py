import copy

from fastapi.testclient import TestClient

from app.advice.rules import advisories
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.main import app

client = TestClient(app)


def post(design):
    return client.post("/api/advisories", json={"design": design})


def test_returns_the_advisories_of_a_valid_design():
    response = post(basic_wardrobe())
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["advisories"] == advisories(basic_wardrobe(), load_catalog())
    assert "r2-board" in {a["id"] for a in body["data"]["advisories"]}


def test_a_v1_design_is_upgraded_first():
    design = basic_wardrobe()
    design["schemaVersion"] = 1
    del design["site"], design["carcass"]["plinthHeight"]
    for compartment in design["compartments"]:
        del compartment["inserts"]
    assert post(design).json()["data"]["advisories"] == advisories(basic_wardrobe(), load_catalog())


def test_an_invalid_design_is_a_422_with_the_engine_error():
    design = basic_wardrobe()
    design["dimensions"]["width"] = 99999
    response = post(design)
    assert response.status_code == 422
    assert response.json()["success"] is False
    assert response.json()["error"]["code"] == "OUT_OF_RANGE"
    assert response.json()["error"]["path"] == "dimensions.width"


def test_schema_and_catalog_errors():
    broken = basic_wardrobe()
    del broken["doors"]
    assert post(broken).json()["error"]["code"] == "SCHEMA_INVALID"
    unknown = basic_wardrobe()
    unknown["carcass"]["appearance"]["color"] = {"catalogId": "no_such_color"}
    assert post(unknown).json()["error"]["code"] == "UNKNOWN_CATALOG_ID"


def test_errors_never_echo_the_request():
    design = basic_wardrobe()
    design["<script>alert(1)</script>"] = True
    response = post(design)
    assert response.status_code == 422
    assert "script" not in response.text


def test_the_body_must_carry_a_design():
    assert client.post("/api/advisories", json={}).status_code == 422
    assert client.post("/api/advisories", json={"design": []}).status_code == 422
    assert client.get("/api/advisories").status_code == 405


def test_the_design_sent_is_not_changed_or_stored():
    design = basic_wardrobe()
    before = copy.deepcopy(design)
    post(design)
    assert design == before
    assert post(design).json() == post(design).json()
