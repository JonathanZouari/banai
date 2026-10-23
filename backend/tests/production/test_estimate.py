"""Material-cost estimate (app.production.estimate): researched prices only, unpriced items listed."""

import pytest

from app.domain.defaults import basic_wardrobe
from app.production.boards import BACK_BOARD
from app.production.estimate import PRICE, VAT, estimate, shekel
from app.production.nesting import nest
from app.production.parts import production
from tests.production.samples import CATALOG, DESIGNS, hinged, make


def run(design: dict):
    prod = production(design, CATALOG)
    nesting = nest(prod.parts)
    return prod, nesting, estimate(prod, nesting)


def board_of(prod, kind: str, thickness: int):
    return next(b for b in prod.boards.values() if b.kind == kind and b.thickness == thickness and not b.fixed)


def test_basic_wardrobe_estimate():
    prod, nesting, est = run(basic_wardrobe())
    lines = {line.name: line for line in est.lines}
    body = board_of(prod, "melamine", 18)
    sheets = lines[f"{body.name}, 18 מ״מ"]
    count = nesting.by_board[body.key]
    assert (sheets.qty, sheets.lo, sheets.hi) == (count, 220 * count, 250 * count)  # white melamine [59][61]
    assert sheets.note == "לפי מחיר לוח 17 מ״מ"  # the research prices 17 mm board
    assert lines[f"{BACK_BOARD.name}, 5 מ״מ"].src == "[59][60][62]"
    assert lines["ציר סמוי 110° עם טריקה שקטה"].lo == 10 * 24
    assert lines["ציר סמוי 155° ללא בליטה"].hi == 5 * 49
    assert lines[f"קנט {body.name}, 18 מ״מ"].qty == 44
    assert est.lo == sum(line.lo for line in est.lines) and est.hi == sum(line.hi for line in est.lines)
    assert est.lo_vat == pytest.approx(est.lo * (1 + VAT)) and est.hi_vat == pytest.approx(est.hi * 1.18)
    # Listed, never given an invented price.
    assert set(est.unpriced) == {"מסילות מגירה סמויות, טריקה שקטה", "תומך מוט (שושנה)", "ידית מוט · נירוסטה",
                                 "פין מדף", "בורג קונפירמט (אומדן)"}


@pytest.mark.parametrize("name", DESIGNS)
def test_every_priced_line_uses_the_research_table(name):
    _, _, est = run(DESIGNS[name]())
    keys = {(lo, hi, src) for lo, hi, src in PRICE.values()}
    for line in est.lines:
        unit = (line.lo / line.qty, line.hi / line.qty, line.src)
        assert unit in keys, line
        assert line.lo <= line.hi


def test_veneer_and_custom_materials_are_unpriced():
    veneer = make(hinged(), {"op": "set_material", "target": "carcass", "material": {"catalogId": "oak_veneer"},
                             "color": {"catalogId": "natural_oak"}})
    prod, _, est = run(veneer)
    board = board_of(prod, "veneer", 17)
    assert {f"{board.name}, 17 מ״מ", f"קנט {board.name}, 17 מ״מ"} <= set(est.unpriced)
    assert not any(board.name in line.name for line in est.lines)  # P2 assumed 350-450 a sheet
    custom = make(hinged(), {"op": "set_material", "target": "doors", "material": {"custom": True, "name": "Formica"}})
    _, _, est = run(custom)
    assert any(name.startswith("Formica · ") for name in est.unpriced)


def test_lacquered_mdf_is_priced_as_raw_mdf_with_painted_edges():
    design = make(hinged(), {"op": "set_material", "target": "doors", "material": {"catalogId": "lacquered_mdf"},
                             "finish": {"catalogId": "gloss"}})
    prod, _, est = run(design)
    mdf = board_of(prod, "mdf", 17)
    assert mdf.key not in prod.edge_m  # painted, not banded
    line = next(line for line in est.lines if line.name == f"{mdf.name}, 17 מ״מ")
    assert (line.lo / line.qty, line.hi / line.qty, line.src) == PRICE["sheetMdf"]
    assert f"צביעה בתנור: {mdf.name}" in est.unpriced


def test_a_grip_groove_is_machining_not_an_unpriced_purchase():
    _, _, est = run(make(hinged(), {"op": "set_handles", "target": "all", "style": "groove"}))
    assert not any("חריץ" in name for name in est.unpriced)


def test_boards_outside_the_priced_thickness_are_unpriced():
    prod, _, est = run(make(hinged(), panel=25))
    assert f"{board_of(prod, 'melamine', 25).name}, 25 מ״מ" in est.unpriced


def test_shekel_rounds_half_up_with_grouping():
    assert shekel(3832.5) == "₪3,833"
    assert shekel(240) == "₪240"
