import pytest

from app.agent.describe import describe_op, describe_ops
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe

CATALOG = load_catalog()
DESIGN = basic_wardrobe()


@pytest.mark.parametrize(
    ("op", "title", "detail"),
    [
        ({"op": "create_wardrobe", "width": 1800, "height": 2200, "depth": 580, "compartmentCount": 3}, "New wardrobe", "180 cm wide"),
        ({"op": "update_dimensions", "width": 2200, "height": 2500}, "Change size", "width 220 cm, height 250 cm"),
        ({"op": "configure_doors", "type": "sliding", "count": 3}, "Sliding doors", "3 sliding"),
        ({"op": "configure_doors", "type": "none"}, "Remove doors", "No doors"),
        ({"op": "configure_doors", "type": "hinged"}, "Hinged doors", "3 hinged doors"),
        ({"op": "add_compartment", "position": 0, "width": 300}, "Add compartment", "position 1"),
        ({"op": "modify_compartment", "compartmentId": "cmp_left", "width": 500}, "Resize compartment", "compartment 1 to 50 cm"),
        ({"op": "add_partition", "compartmentId": "cmp_left", "offset": 300}, "Add partition", "compartment 1, 30 cm"),
        ({"op": "modify_partition", "partitionId": "prt_1", "thickness": 25}, "Change partition", "partition 1: thickness 2.5 cm"),
        ({"op": "add_drawer", "compartmentId": "cmp_left", "y": 0, "height": 150}, "Add drawer", "15 cm tall"),
        ({"op": "add_rail", "compartmentId": "cmp_left", "y": 1900}, "Add hanging rail", "190 cm"),
        ({"op": "modify_shelf", "id": "shf_l1", "y": 450}, "Change shelf", "shelf in compartment 1: y 45 cm"),
        ({"op": "set_material", "target": "doors", "color": {"catalogId": "black"}}, "Change appearance", "the doors: black"),
        ({"op": "set_material", "target": "carcass", "color": {"custom": True, "name": "Sage green"}}, "Change appearance", "Sage green"),
        ({"op": "set_material", "target": "shf_l1", "clear": True}, "Change appearance", "reset to inherited"),
        ({"op": "remove_component", "id": "drw_r1"}, "Remove", "drawer in compartment 3"),
    ],
)
def test_each_op_is_described_in_plain_language(op, title, detail):
    described = describe_op(op, DESIGN)
    assert described["title"] == title and detail in described["detail"]


def test_a_batch_is_described_against_each_ops_own_base_state():
    ops = [{"op": "add_compartment", "position": 0, "width": 200, "id": "cmp_new", "partitionId": "prt_new"},
           {"op": "add_shelf", "compartmentId": "cmp_new", "y": 300, "id": "shf_new"}]
    changes = describe_ops(ops, DESIGN, lambda d, o: apply_ops(d, o, CATALOG))
    assert "compartment 1" in changes[1]["detail"]
