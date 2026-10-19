"""Room geometry (ADR-037): walls, free floor in front and space beside the wardrobe. The cases are shared with
the frontend (shared/fixtures/room_geometry.json), so both engines measure the same room the same way."""
import json
from pathlib import Path

import pytest

from app.domain.apply import apply_ops
from app.domain.room import effective_clearance, fits, front_clearance, side_gap, walls

CASES = json.loads((Path(__file__).parents[3] / "shared" / "fixtures" / "room_geometry.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_room_geometry(case, two, catalog):
    design = apply_ops(two, case["ops"], catalog)
    assert [w["length"] for w in walls(design["room"]["shape"])] == case["walls"]
    assert fits(design) is case["fits"]
    assert front_clearance(design) == case["front"]
    assert (side_gap(design, "left"), side_gap(design, "right")) == (case["left"], case["right"])


def test_the_measured_clearance_wins_over_the_room(two, catalog):
    design = apply_ops(two, CASES[0]["ops"], catalog)
    assert effective_clearance(design) == 3500
    measured = apply_ops(design, [{"op": "set_site", "clearance": 900}], catalog)
    assert effective_clearance(measured) == 900
    assert effective_clearance(two) is None and front_clearance(two) is None and side_gap(two, "left") is None
