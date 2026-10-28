"""Starting templates: each one validates and equals its shared fixture (the same fixture vitest
checks against frontend/src/domain/presets.js, so the two op lists cannot drift)."""

import pytest

from app.domain.defaults import BASIC_WARDROBE_OPS, TEMPLATE_OPS, build_template
from app.domain.validation import validate_design
from tests.domain.conftest import load_design


def fixture_name(template_id: str) -> str:
    return "basic" if template_id == "basic" else f"template_{template_id}"


def test_templates_are_listed_in_gallery_order():
    assert list(TEMPLATE_OPS) == ["basic", "kids", "double", "minimal"]
    assert TEMPLATE_OPS["basic"] is BASIC_WARDROBE_OPS


@pytest.mark.parametrize("template_id", list(TEMPLATE_OPS))
def test_template_is_valid_and_matches_shared_fixture(template_id, catalog):
    design = build_template(template_id)
    assert validate_design(design, catalog) == []
    assert design == load_design(fixture_name(template_id))


@pytest.mark.parametrize("template_id", list(TEMPLATE_OPS))
def test_template_starts_with_create_wardrobe(template_id):
    assert TEMPLATE_OPS[template_id][0]["op"] == "create_wardrobe"


def test_unknown_template_raises():
    with pytest.raises(KeyError):
        build_template("castle")
