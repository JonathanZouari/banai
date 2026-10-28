"""Validate that every built-in template produces a valid design."""
import pytest

from app.domain.catalog import load_catalog
from app.domain.defaults import TEMPLATES, template_wardrobe
from app.domain.validation import validate_design


@pytest.mark.parametrize("tmpl", TEMPLATES, ids=lambda t: t["id"])
def test_template_is_valid(tmpl):
    catalog = load_catalog()
    design = template_wardrobe(tmpl["id"])
    issues = validate_design(design, catalog)
    assert issues == [], f"Template '{tmpl['id']}' validation errors: {issues}"


def test_unknown_template_raises():
    with pytest.raises(ValueError, match="Unknown template"):
        template_wardrobe("nonexistent")
