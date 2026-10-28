import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.domain.defaults import BASIC_WARDROBE_OPS, TEMPLATE_OPS, basic_wardrobe, build_template
from app.domain.validation import validate_design
from app.main import app
from tests.domain.conftest import FIXTURES_DIR, load_design

TEMPLATE_IDS = ["basic", "kids", "double-sliding", "minimalist"]
PREFIX = re.compile(r"^(cmp|prt|shf|drw|rail|dr)_[A-Za-z0-9_-]{1,40}$")
client = TestClient(app)


def fixture_name(template_id: str) -> str:
    return "basic" if template_id == "basic" else f"template_{template_id.replace('-', '_')}"


def all_ids(design: dict) -> list[str]:
    ids = [item["id"] for compartment in design["compartments"]
           for key in ("shelves", "drawers", "rails") for item in compartment[key]]
    ids += [compartment["id"] for compartment in design["compartments"]]
    ids += [partition["id"] for partition in design["partitions"]]
    ids += [door["id"] for door in design["doors"]["items"]]
    return ids


def numbers(value):
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from numbers(child)
    elif isinstance(value, list):
        for child in value:
            yield from numbers(child)


def test_templates_are_basic_first_and_unique():
    assert list(TEMPLATE_OPS) == TEMPLATE_IDS
    assert TEMPLATE_OPS["basic"] is BASIC_WARDROBE_OPS


def test_every_shared_template_fixture_has_a_template():
    on_disk = sorted(path.stem for path in (FIXTURES_DIR / "designs").glob("template_*.json"))
    assert on_disk == sorted(fixture_name(t) for t in TEMPLATE_IDS if t != "basic")


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_template_is_valid_and_matches_the_shared_fixture(template_id, catalog):
    design = build_template(template_id)
    assert validate_design(design, catalog) == []
    assert design == load_design(fixture_name(template_id))  # the frontend is checked against the same file


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_template_ids_are_unique_and_lengths_are_integers(template_id):
    design = build_template(template_id)
    ids = all_ids(design)
    assert len(ids) == len(set(ids))
    assert all(PREFIX.match(value) for value in ids)
    assert all(isinstance(value, int) for value in numbers(design["dimensions"]))
    assert all(isinstance(value, int) for value in numbers(design["compartments"]))


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_template_is_deterministic(template_id):
    assert build_template(template_id) == build_template(template_id)


def test_basic_template_is_the_unchanged_basic_wardrobe():
    assert build_template("basic") == basic_wardrobe()


def test_templates_differ_from_each_other():
    designs = [json.dumps(build_template(t), sort_keys=True) for t in TEMPLATE_IDS]
    assert len(set(designs)) == len(designs)


def test_unknown_template_is_rejected():
    with pytest.raises(KeyError):
        build_template("nope")


@pytest.mark.parametrize("template_id", TEMPLATE_IDS)
def test_template_designs_can_be_saved_and_exported(template_id):
    design = build_template(template_id)
    saved = client.post("/api/designs", json={"design": design, "language": "en"})
    assert saved.status_code in (200, 201), saved.text
    exported = client.post("/api/export/pdf", json={"design": design, "language": "en"})
    assert exported.status_code == 200
    assert exported.headers["content-type"] == "application/pdf"
