import copy
import json

import pytest

from app.domain.defaults import LIMITS, basic_wardrobe
from app.domain.errors import DomainError
from app.domain.schema import parse_design
from app.domain.validation import validate_design

from .conftest import load_design


def codes(errors):
    return [(e.code, e.path) for e in errors]


def test_fixture_design_is_valid(two, catalog):
    assert validate_design(two, catalog) == []


def test_round_trip_is_lossless(two):
    dumped = parse_design(two)
    assert dumped == two
    assert json.loads(json.dumps(dumped)) == two


def test_basic_wardrobe_matches_shared_fixture_and_is_valid(catalog):
    design = basic_wardrobe()
    assert design == load_design("basic")
    assert validate_design(design, catalog) == []


def test_unknown_field_is_schema_error(two):
    bad = {**two, "price": 100}
    with pytest.raises(DomainError) as info:
        parse_design(bad)
    assert info.value.code == "SCHEMA_INVALID"


def test_float_dimension_is_schema_error(two):
    bad = copy.deepcopy(two)
    bad["dimensions"]["width"] = 1000.5
    with pytest.raises(DomainError) as info:
        parse_design(bad)
    assert info.value.code == "SCHEMA_INVALID"
    assert info.value.path == "dimensions.width"


def test_wrong_id_prefix_is_schema_error(two):
    bad = copy.deepcopy(two)
    bad["compartments"][0]["shelves"][0]["id"] = "cmp_x"
    errors = validate_design(bad, None)
    assert errors[0].code == "SCHEMA_INVALID"


def test_width_mismatch(two, catalog):
    bad = copy.deepcopy(two)
    bad["compartments"][0]["width"] = 400
    assert codes(validate_design(bad, catalog)) == [("WIDTH_MISMATCH", "compartments")]


def test_partition_count_mismatch(two, catalog):
    bad = copy.deepcopy(two)
    bad["partitions"] = []
    assert ("WIDTH_MISMATCH", "partitions") in codes(validate_design(bad, catalog))


def test_dimension_out_of_range(two, catalog):
    bad = copy.deepcopy(two)
    bad["dimensions"]["depth"] = LIMITS["depth"][1] + 1
    assert ("OUT_OF_RANGE", "dimensions.depth") in codes(validate_design(bad, catalog))


def test_hinged_door_without_hinge_side(two, catalog):
    bad = copy.deepcopy(two)
    bad["doors"]["items"][0]["hingeSide"] = None
    assert ("DOOR_INVALID", "doors.items[0].hingeSide") in codes(validate_design(bad, catalog))


def test_hinged_door_non_contiguous(catalog):
    design = basic_wardrobe()
    design["doors"]["items"] = [
        {"id": "dr_1", "compartmentIds": ["cmp_left", "cmp_right"], "hingeSide": "left", "appearance": None}
    ]
    assert ("DOOR_INVALID", "doors.items[0].compartmentIds") in codes(validate_design(design, catalog))


def test_hinged_door_unknown_compartment(two, catalog):
    bad = copy.deepcopy(two)
    bad["doors"]["items"][0]["compartmentIds"] = ["cmp_nope"]
    assert ("DOOR_INVALID", "doors.items[0].compartmentIds") in codes(validate_design(bad, catalog))


def test_sliding_door_with_compartments_is_invalid(two, catalog):
    bad = copy.deepcopy(two)
    bad["doors"]["type"] = "sliding"
    bad["doors"]["items"][1]["hingeSide"] = None
    bad["doors"]["items"][0]["hingeSide"] = None
    assert ("DOOR_INVALID", "doors.items[0].compartmentIds") in codes(validate_design(bad, catalog))


def test_none_doors_with_items_is_invalid(two, catalog):
    bad = copy.deepcopy(two)
    bad["doors"]["type"] = "none"
    assert ("DOOR_INVALID", "doors.items") in codes(validate_design(bad, catalog))


def test_catalog_check_skipped_without_catalog(two):
    bad = copy.deepcopy(two)
    bad["carcass"]["appearance"]["color"] = {"catalogId": "pink"}
    assert validate_design(bad, None) == []


def test_all_errors_are_reported_in_order(two, catalog):
    bad = copy.deepcopy(two)
    bad["dimensions"]["depth"] = 10
    bad["compartments"][0]["shelves"][0]["y"] = -5
    found = codes(validate_design(bad, catalog))
    assert found.index(("OUT_OF_RANGE", "dimensions.depth")) < found.index(
        ("OUT_OF_BOUNDS", "compartments[0].shelves[0].y")
    )


def test_domain_error_to_dict():
    error = DomainError("NOT_FOUND", "ops[0].id", "missing")
    assert error.to_dict() == {"code": "NOT_FOUND", "path": "ops[0].id", "message": "missing"}


def test_catalog_entries_are_safe_text():
    """L2 (Phase 4 review): catalog names obey the same safe-text rules as custom names."""
    from app.domain.catalog import load_catalog
    from app.domain.schema import CustomRef

    for section in load_catalog().values():
        for entry in section:
            CustomRef.model_validate({"custom": True, "name": entry["name"]})


def test_handles_default_is_emitted_and_not_shared(two):
    legacy = copy.deepcopy(two)
    del legacy["handles"]
    for door in legacy["doors"]["items"]:
        del door["handle"], door["mirror"]
    del legacy["compartments"][0]["drawers"][0]["handle"]
    first, second = parse_design(legacy), parse_design(legacy)
    assert first == two
    first["handles"]["style"] = "knob"
    assert second["handles"] == {"style": "bar", "finish": "steel"}


@pytest.mark.parametrize(
    "path, value",
    [
        (("handles",), {"style": "bar"}),
        (("handles",), None),
        (("handles", "finish"), "gold"),
        (("handles", "extra"), 1),
        (("doors", "items", 0, "handle"), {"style": "knob"}),
        (("doors", "items", 0, "mirror"), "yes"),
        (("doors", "items", 0, "mirror"), 1),
        (("doors", "items", 0, "mirror"), None),
        (("compartments", 0, "drawers", 0, "handle"), {"style": "pull", "finish": "steel"}),
    ],
)
def test_bad_handle_and_mirror_values_are_schema_errors(two, path, value):
    bad = copy.deepcopy(two)
    target = bad
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(DomainError) as info:
        parse_design(bad)
    assert info.value.code == "SCHEMA_INVALID"


def test_every_handle_style_and_finish_is_accepted(two):
    for style in ("bar", "knob", "edge", "cup", "groove", "none"):
        for finish in ("steel", "black", "brass"):
            design = copy.deepcopy(two)
            design["handles"] = {"style": style, "finish": finish}
            assert parse_design(design)["handles"] == {"style": style, "finish": finish}


def test_catalog_grain_is_a_known_wood_family():
    from app.domain.catalog import GRAINS, load_catalog

    colors = load_catalog()["colors"]
    grains = {entry["id"]: entry["grain"] for entry in colors if "grain" in entry}
    assert set(grains.values()) <= set(GRAINS)
    assert grains["natural_oak"] == "oak" and grains["walnut"] == "walnut"
    assert {"light_oak", "ash", "cherry", "teak", "smoked_oak", "wenge"} <= set(grains)
    assert all(entry["id"] not in grains for entry in colors[:4])  # plain colours have no grain


def test_catalog_keeps_existing_order_and_a_single_walnut():
    from app.domain.catalog import load_catalog

    colors = load_catalog()["colors"]
    ids = [entry["id"] for entry in colors]
    assert ids[:6] == ["white", "light_grey", "anthracite", "black", "natural_oak", "walnut"]
    assert len(ids) == len(set(ids)) and "pink" not in ids
    assert [e["id"] for e in colors if "אגוז" in e["name"]] == ["walnut"]  # one walnut, by its Hebrew name
