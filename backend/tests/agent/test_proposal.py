import pytest

from app.agent.proposal import complete_and_validate
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.domain.errors import DomainError

CATALOG = load_catalog()


def test_missing_ids_are_generated_before_signing():
    design = basic_wardrobe()
    ops, final = complete_and_validate(design, [{"op": "add_shelf", "compartmentId": "cmp_middle", "y": 500}], CATALOG)
    assert ops[0]["id"].startswith("shf_")
    assert any(s["id"] == ops[0]["id"] for s in final["compartments"][1]["shelves"])
    assert design == basic_wardrobe()  # the committed design is never touched


def test_replaying_the_filled_ops_is_deterministic():
    design = basic_wardrobe()
    raw = [
        {"op": "add_compartment", "position": 1, "width": 300},
        {"op": "configure_doors", "type": "hinged"},
        {"op": "add_drawer", "compartmentId": "cmp_left", "y": 0, "height": 150},
    ]
    ops, final = complete_and_validate(design, raw, CATALOG)
    assert apply_ops(design, ops, CATALOG) == final


def test_create_wardrobe_and_sliding_doors_get_ids():
    ops, final = complete_and_validate(
        basic_wardrobe(),
        [
            {"op": "create_wardrobe", "width": 1800, "height": 2200, "depth": 580, "compartmentCount": 3},
            {"op": "configure_doors", "type": "sliding", "count": 2},
        ],
        CATALOG,
    )
    assert len(ops[0]["compartmentIds"]) == 3 and len(ops[0]["partitionIds"]) == 2
    assert len(ops[1]["ids"]) == 2 and len(final["doors"]["items"]) == 2


def test_hinged_doors_without_a_list_follow_the_compartments_made_by_earlier_ops():
    _, final = complete_and_validate(
        basic_wardrobe(),
        [{"op": "add_compartment", "position": 0, "width": 200}, {"op": "configure_doors", "type": "hinged"}],
        CATALOG,
    )
    assert len(final["doors"]["items"]) == 4


def test_explicit_nulls_are_treated_as_omitted():
    raw = [{"op": "add_shelf", "compartmentId": "cmp_left", "y": 500, "id": None, "thickness": None}]
    ops, _ = complete_and_validate(basic_wardrobe(), raw, CATALOG)
    assert "thickness" not in ops[0] and ops[0]["id"].startswith("shf_")


def test_error_path_points_at_the_failing_op():
    raw = [
        {"op": "add_shelf", "compartmentId": "cmp_left", "y": 500},
        {"op": "add_shelf", "compartmentId": "cmp_nope", "y": 500},
    ]
    with pytest.raises(DomainError) as error:
        complete_and_validate(basic_wardrobe(), raw, CATALOG)
    assert error.value.path.startswith("ops[1]")


@pytest.mark.parametrize(
    "raw",
    [
        [],
        [{"op": "drop_database"}],
        [{"op": "add_shelf", "compartmentId": "cmp_left", "y": 1.5}],
        [{"op": "add_shelf", "compartmentId": "cmp_left", "y": 99999999}],
        [{"op": "update_dimensions", "width": 99999}],
        [{"op": "add_shelf", "compartmentId": "cmp_left", "y": 100, "extra": 1}],
    ],
)
def test_invalid_batches_are_rejected(raw):
    with pytest.raises(DomainError):
        complete_and_validate(basic_wardrobe(), raw, CATALOG)
