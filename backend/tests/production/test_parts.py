"""Cut list, hardware and edge banding (app.production.parts), checked against the P2 prototype formulas."""

import pytest

from app.domain.defaults import basic_wardrobe
from app.domain.layout import hinges_for, layout
from app.production.boards import BACK_BOARD, DRAWER_BOARD, board_for
from app.production.parts import production
from tests.production.samples import (
    CATALOG,
    DESIGNS,
    color,
    hinged,
    make,
    plinth_inserts,
    sliding,
    sliding_walnut,
    split_door,
)


def rows(design: dict) -> list[tuple]:
    return [(p.name, p.qty, p.length, p.width, p.thickness) for p in production(design, CATALOG).parts]


def hardware(design: dict) -> dict[str, int]:
    return {h.name: h.qty for h in production(design, CATALOG).hardware}


def test_basic_wardrobe_by_hand():
    """2000 x 2400 x 600, 18 mm board, no plinth, compartments 643/643/642, hinged doors left/right/left.
    Hand-computed with the formulas of prototypes/p2-dossier/js/production.js."""
    hi = 2400 - 2 * 18 - 0  # interior height 2364
    shelf_d = (600 - 25) - 13  # shelf depth with hinged doors, from the back's path: 562
    assert rows(basic_wardrobe()) == [
        ("דופן", 2, 2400, 600, 18),  # H x D
        ("תקרה", 1, 2000 - 36, 600, 18),  # W - 2P
        ("רצפה", 1, 2000 - 36, 600, 18),
        ("מחיצה", 2, hi, 600 - 13, 18),  # P2 had D - 30; see test_partitions_reach_the_front_with_hinged_doors
        # Backs: Hi + 2 x 7 into the grooves. Pieces run from the side groove (18 - 7 = 11) to partition
        # centres (670, 1331) and the right groove (2000 - 18 + 7 = 1989); two together would pass 1200.
        ("גב", 1, hi + 14, 670 - 11, 5), ("גב", 1, hi + 14, 1331 - 670, 5), ("גב", 1, hi + 14, 1989 - 1331, 5),
        ("מדף", 5, 643 - 2, shelf_d, 18),  # 4 shelves in compartment 1 and one in compartment 2 merge
        ("מדף", 2, 642 - 2, shelf_d, 18),
        # Doors meet at partition centres with a 3 mm joint: 0-670, 670-1331, 1331-2000, each minus 3.
        ("דלת", 1, 2400 - 3, 667, 18), ("דלת", 1, 2400 - 3, 658, 18), ("דלת", 1, 2400 - 3, 666, 18),
        ("חזית מגירה", 2, 642 - 4, 200 - 3, 18),  # inset between the sides; a 3 mm reveal between fronts
        ("דופן מגירה", 4, 500 - 10, 197 - 64, 16),  # 500 mm runners: box depth = runner - 10 [28]
        ("גב וחזית פנימית", 4, 642 - 42, 197 - 64 - 13, 16),  # inner width = opening - 42 [28]
        ("תחתית מגירה", 2, 642 - 42, 490 - 32, 16),
    ]


def test_basic_wardrobe_hardware_and_edges():
    prod = production(basic_wardrobe(), CATALOG)
    assert {h.name: h.qty for h in prod.hardware} == {
        "ציר סמוי 110° עם טריקה שקטה": 10,  # 2397 mm doors take 5 hinges each
        "ציר סמוי 155° ללא בליטה": 5,  # the right door covers the drawers (R10)
        "מסילות מגירה סמויות, טריקה שקטה": 2,
        "מוט תלייה Ø25": 1,
        "תומך מוט (שושנה)": 2,  # 643 mm: no middle support
        "ידית מוט · נירוסטה": 5,  # 3 doors + 2 drawers
        "פין מדף": 28,  # 7 shelves x 4
        "זווית עיגון מגולוונת": 4,  # 2 + ceil((2000 - 1200) / 600)
        "בורג קונפירמט (אומדן)": 24,  # (4 corners + 2 x 2 partitions) x 3
    }
    body = board_for(basic_wardrobe()["carcass"]["appearance"], 18, CATALOG)
    # Sides 2x2400, top and bottom 2x1964, partitions 2x2364, shelves 5x641 + 2x640 (front edge),
    # doors 2x(2397+667) + 2x(2397+658) + 2x(2397+666), drawer fronts 2 x 2x(638+197) = 39,647 mm, +10%.
    assert prod.edge_m == {body.key: 44, DRAWER_BOARD.key: 5}  # drawer boxes: 4x490 + 4x600 = 4.36 m
    assert prod.runner == 500


def test_partitions_reach_the_front_with_hinged_doors():
    """The neighbouring doors' hinges mount on the partition, so it can't be set back (P2 had D - 30)."""
    lay = layout(basic_wardrobe())
    assert production(basic_wardrobe(), CATALOG).partition_depth == lay.depth - 13


def test_sliding_wardrobe():
    design = sliding_walnut()
    prod = production(design, CATALOG)
    lay = layout(design)
    hi = 2400 - 34
    panels = [p for p in prod.parts if p.group == "חזיתות"]
    assert [(p.name, p.qty, p.length, p.width) for p in panels] == [("כנף הזזה", 3, hi - 56, round((2400 - 34 + 40) / 3))]
    assert panels[0].note == "חפיפה 20 מ״מ"
    assert panels[0].grain and panels[0].board.color == color("walnut")
    assert [d.track for d in lay.doors] == ["back", "front", "back"]
    # Partitions stop behind the tracks; P2 ran them to D - 17, through the sliding panels.
    assert prod.partition_depth == 600 - 100 - 13
    # 490 mm to the shelf line: a 500 runner would hit the back, so the next size down is used.
    assert prod.runner == 450
    assert ("דופן מגירה", 2, 440, 197 - 64, 16) in rows(design)
    hw = hardware(design)
    assert hw["ערכת מסילות הזזה עליונה ותחתונה"] == 1
    assert not any("ציר" in name for name in hw)
    assert hw["ידית מוט · נירוסטה"] == 4  # 3 panels + 1 drawer: P2 dropped the drawer handles behind sliding doors


def test_plinth_and_inserts():
    design = plinth_inserts()
    prod = production(design, CATALOG)
    by_name = {p.name: p for p in prod.parts}
    assert (by_name["צוקל"].length, by_name["צוקל"].width) == (1800 - 34, 80 - 4)
    shoes = by_name["מדף נעליים משופע"]
    assert (shoes.qty, shoes.length, shoes.width) == (3, 875 - 2, (600 - 25 - 13) - 50)
    assert shoes.note == "תא \u20661\u2069 · שיפוע 14°"
    assert by_name["מחיצה"].length == 2400 - 34 - 80
    hw = hardware(design)
    assert hw["מתקן תלייה נשלף (פנטוגרף)"] == 1
    assert hw["מתקן מכנסיים נשלף"] == 1
    assert hw["מוט חזית למדף נעליים"] == 3
    assert hw["פס LED עם חיישן דלת"] == 1
    assert hw["בורג קונפירמט (אומדן)"] == (4 + 2 + 2) * 3  # the plinth adds two joints
    led = next(h for h in prod.hardware if h.name == "פס LED עם חיישן דלת")
    assert led.spec.startswith("0.8 מ׳")  # 875 - 40 mm
    assert "צוקל 80 מ״מ" in " ".join(prod.method)


@pytest.mark.parametrize("plinth", [0, 4])
def test_no_plinth_part_without_a_plinth(plinth):
    prod = production(make(hinged(), plinth=plinth), CATALOG)
    assert "צוקל" not in {p.name for p in prod.parts}
    assert "ללא צוקל" in " ".join(prod.method)


def test_split_door_leaves():
    design = split_door()
    lay = layout(design)
    left, right = lay.doors
    assert (left.x0, left.width, right.x0, right.width) == (1.5, 497, 501.5, 497)
    fronts = [p for p in production(design, CATALOG).parts if p.group == "חזיתות"]
    assert [(p.name, p.qty, p.length, p.width) for p in fronts] == [("דלת", 2, 2397, 497)]
    kg = 497 * 2397 / 1e6 * 11.6
    assert fronts[0].note == f"{hinges_for(2397, kg)} צירים"
    assert hardware(design)["ציר סמוי 110° עם טריקה שקטה"] == 2 * hinges_for(2397, kg)


def test_a_mirror_door_is_its_own_row():
    design = make(hinged(), {"op": "modify_door", "id": "dr_b", "mirror": True})
    fronts = [p for p in production(design, CATALOG).parts if p.group == "חזיתות"]
    assert [p.name for p in fronts] == ["דלת", "דלת מראה"]
    assert "מראה 4 מ״מ" in fronts[1].note


def test_push_to_open_doors_get_springless_hinges():
    design = make(hinged(), {"op": "set_handles", "target": "all", "style": "none"},
                  {"op": "add_drawer", "compartmentId": "cmp_a", "y": 0, "height": 200, "id": "drw_a"})
    hw = hardware(design)
    assert hw["ציר סמוי 155° ללא בליטה וללא קפיץ"] == 5 and hw["ציר סמוי 110° ללא קפיץ"] == 5
    assert hw["מנגנון פתיחה בלחיצה לדלת"] == 2
    assert hw["מסילות מגירה סמויות, פתיחה בלחיצה"] == 1
    assert not any(name.startswith(("ידית", "ציר סמוי 110° עם")) for name in hw)


def test_item_appearance_overrides_are_their_own_boards():
    custom = {"custom": True, "name": "ירוק מרווה", "hex": "#9caf88"}
    design = make(hinged(), {"op": "add_shelf", "compartmentId": "cmp_a", "y": 800, "id": "shf_a"},
                  {"op": "add_shelf", "compartmentId": "cmp_a", "y": 1200, "id": "shf_b"},
                  {"op": "set_material", "target": "shf_b", "color": custom},
                  {"op": "set_material", "target": "dr_a", "color": {"catalogId": "natural_oak"}})
    prod = production(design, CATALOG)
    shelves = [p for p in prod.parts if p.name == "מדף"]
    assert [(p.qty, p.board.color, p.grain) for p in shelves] == [(1, color("white"), False), (1, "ירוק מרווה", False)]
    doors = [p for p in prod.parts if p.name == "דלת"]
    assert [(d.board.color, d.grain) for d in doors] == [(color("natural_oak"), True), (color("white"), False)]
    # add_shelf defaults to 18 mm on this 17 mm carcass: the shelves are their own 18 mm board.
    assert BACK_BOARD.key in prod.boards and len(prod.boards) == 5
    assert {p.thickness for p in shelves} == {18}


def test_a_drawer_too_small_for_a_box_keeps_its_front_and_says_so():
    design = make(hinged(), {"op": "add_drawer", "compartmentId": "cmp_a", "y": 0, "height": 90, "id": "drw_a"})
    prod = production(design, CATALOG)
    front = next(p for p in prod.parts if p.name == "חזית מגירה")
    assert "בלי תיבה" in front.note
    assert not any(p.name == "דופן מגירה" for p in prod.parts)
    assert "מסילות מגירה סמויות, טריקה שקטה" not in hardware(design)


def test_sliding_tracks_and_panel_height_come_from_the_layout():
    lay = layout(make(sliding(3), width=2400, count=3, plinth=60))
    assert {d.height for d in lay.doors} == {2400 - 34 - 60 - 56}
    assert {d.y0 for d in lay.doors} == {60 + 17 + 12}
    assert [d.track for d in layout(make(sliding(4), width=2400, count=3)).doors] == ["back", "front", "back", "front"]


@pytest.mark.parametrize("name", DESIGNS)
def test_every_part_is_a_real_board_with_its_boxes(name):
    prod = production(DESIGNS[name](), CATALOG)
    assert [p.no for p in prod.parts] == list(range(1, len(prod.parts) + 1))
    for p in prod.parts:
        assert p.qty > 0 and p.length > 0 and p.width > 0 and p.thickness > 0
        assert isinstance(p.length, int) and isinstance(p.width, int)
        assert not p.boxes or len(p.boxes) == p.qty  # drawer-box parts have none: the drawer is one unit
        for b in p.boxes:
            assert all(lo < hi for lo, hi in zip(b.min, b.max, strict=True))
    assert all(h.qty > 0 for h in prod.hardware)
    assert set(prod.edge_m) <= set(prod.boards)


def test_production_is_pure():
    design = basic_wardrobe()
    snapshot = repr(design)
    first = production(design, CATALOG)
    assert repr(design) == snapshot
    assert rows(design) == [(p.name, p.qty, p.length, p.width, p.thickness) for p in first.parts]
