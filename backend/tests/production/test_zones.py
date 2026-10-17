"""Zones (docs/schema.md "Zones") in the manufacturing layout, the cut list, the hardware and the drawings.

The extents are worked out by hand from the formulas the viewer mirrors: a hinged door anchored to a divider
runs from that divider's centre line, plinth + panel + y + thickness / 2 (the carcass bottom, plinth, without a
bottom anchor), to the top anchor's centre line (the carcass top, H, without one), minus DOOR_GAP / 2 at each end.
"""

import xml.etree.ElementTree as ET
from collections import Counter

import pytest

from app.domain.apply import apply_ops
from app.domain.defaults import basic_wardrobe
from app.domain.layout import DOOR_GAP, layout
from app.production import drawings
from app.production.boards import board_for
from app.production.parts import production
from tests.production.samples import CATALOG, hinged, make, sliding, thirds, zoned

SVG = "{http://www.w3.org/2000/svg}"
LRI, PDI = "⁦", "⁩"
ZONE_DOORS = ("dr_left_z1", "dr_left_z2", "dr_left_z3")


def doors_by_id(design: dict) -> dict:
    return {d.id: d for d in layout(design).doors}


def hardware(design: dict) -> dict[str, int]:
    return {h.name: h.qty for h in production(design, CATALOG).hardware}


def mixed() -> dict:
    """The left column in thirds: zone 1 a door, zone 2 open, zone 3 a pair."""
    return apply_ops(basic_wardrobe(), [
        {"op": "set_zones", "compartmentId": "cmp_left", "count": 3},
        {"op": "set_zone_door", "compartmentId": "cmp_left", "zone": 2, "leaves": 0},
        {"op": "set_zone_door", "compartmentId": "cmp_left", "zone": 3, "leaves": 2},
    ], CATALOG)


# ---------- layout ----------

def test_thirds_by_hand():
    """basic: 2000 x 2400, 18 mm board, no plinth, interior 2400 - 2 x 18 = 2364. set_zones 3 snaps shf_l2 (y 800)
    and shf_l4 (y 1600), both 18 mm, into dividers. Their centre lines above the floor: 0 + 18 + 800 + 9 = 827 and
    0 + 18 + 1600 + 9 = 1627. Zone doors: 0..827, 827..1627 and 1627..2400, each 1.5 mm in at both ends."""
    doors = doors_by_id(thirds())
    assert [(doors[i].y0, doors[i].height) for i in ZONE_DOORS] == [(1.5, 824), (828.5, 797), (1628.5, 770)]
    # Across, a zone door is the whole column's door: the side panel to the middle of prt_1 (670), minus 3.
    assert {(doors[i].x0, doors[i].width) for i in ZONE_DOORS} == {(1.5, 667)}
    assert [doors[i].anchors for i in ZONE_DOORS] == [(None, "shf_l2"), ("shf_l2", "shf_l4"), ("shf_l4", None)]
    assert sum(doors[i].height for i in ZONE_DOORS) + 3 * DOOR_GAP == 2400  # three doors and three gaps fill it
    # An unanchored door doesn't change: the plinth (0) + 1.5, and H - plinth - 3.
    assert (doors["dr_middle"].y0, doors["dr_middle"].height, doors["dr_middle"].hinges) == (1.5, 2397, 5)
    # Weight and hinges follow each door's own height: 0.667 x 0.824 m x 11.6 kg/m2 = 6.4 kg, 2 hinges.
    assert doors["dr_left_z1"].kg == pytest.approx(0.667 * 0.824 * 11.6)
    assert [doors[i].hinges for i in ZONE_DOORS] == [2, 2, 2]


def test_a_mixed_column_has_a_door_an_open_zone_and_a_pair():
    lay = layout(mixed())
    left = [(d.id, d.x0, d.width, d.y0, d.height, d.hinge) for d in lay.doors if d.compartments == [0]]
    assert left == [
        ("dr_left_z1", 1.5, 667, 1.5, 824, "left"),
        # The pair splits 0..670 at 335 and groups by compartment and anchors; the first in item order is the left leaf.
        ("dr_left_z3", 1.5, 332, 1628.5, 770, "left"),
        ("dr_left_z3r", 336.5, 332, 1628.5, 770, "right"),
    ]
    assert drawings._open_spans(lay, 0) == [(827, 1627)]  # zone 2 is open, centre line to centre line
    assert drawings._open_spans(lay, 1) == []  # the middle door covers its compartment


def test_odd_dividers_on_a_plinth_give_half_millimetre_extents():
    """1800 x 2400, 17 mm board, 80 mm plinth: interior 2400 - 34 - 80 = 2286. The divider is centred on
    round(2286 / 2) = 1143, so y = 1143 - 8 = 1135 and its centre line is 80 + 17 + 1135 + 8.5 = 1240.5."""
    design = make(hinged(2), {"op": "set_zones", "compartmentId": "cmp_a", "count": 2}, plinth=80)
    doors = doors_by_id(design)
    assert (doors["dr_a_z1"].y0, doors["dr_a_z1"].height) == (81.5, 1157.5)  # 80 .. 1240.5
    assert (doors["dr_a_z2"].y0, doors["dr_a_z2"].height) == (1242, 1156.5)  # 1240.5 .. 2400
    assert (doors["dr_b"].y0, doors["dr_b"].height) == (81.5, 2317)  # unanchored: from the plinth
    fronts = [(p.length, p.width) for p in production(design, CATALOG).parts if p.group == "חזיתות"]
    # The cut list rounds half up to whole millimetres. Across: 0 .. 17 + 875 + 17 / 2 = 900.5, minus 3.
    assert fronts[:2] == [(1158, 898), (1157, 898)]


# ---------- cut list and hardware ----------

def test_thirds_parts_hardware_and_edges():
    prod = production(thirds(), CATALOG)
    shelves = [(p.name, p.group, p.qty, p.length, p.width, p.thickness, p.note) for p in prod.parts if "מדף" in p.name]
    assert shelves == [
        # Dividers are structure: the full compartment width, flush with the partitions (600 - 13), in the carcass group.
        ("מדף קבוע", "גוף", 2, 643, 600 - 13, 18, f"תא {LRI}1{PDI}"),
        # On pins: shf_l1, shf_l3 and the middle compartment's shelf (643 - 2), and the right compartment's two.
        ("מדף", "פנים", 3, 641, 600 - 25 - 13, 18, f"תאים {LRI}1, 2{PDI}"),
        ("מדף", "פנים", 2, 640, 600 - 25 - 13, 18, f"תא {LRI}3{PDI}"),
    ]
    assert [p.name for p in prod.parts][:5] == ["דופן", "תקרה", "רצפה", "מחיצה", "מדף קבוע"]
    fronts = [(p.qty, p.length, p.width, p.note) for p in prod.parts if p.group == "חזיתות"]
    assert fronts == [
        (1, 824, 667, f"תא {LRI}1{PDI} · אזור 1 · 2 צירים"),
        (1, 797, 667, f"תא {LRI}1{PDI} · אזור 2 · 2 צירים"),
        (1, 770, 667, f"תא {LRI}1{PDI} · אזור 3 · 2 צירים"),
        (1, 2397, 658, "5 צירים"),
        (1, 2397, 666, "5 צירים"),
    ]
    hw = {h.name: h for h in prod.hardware}
    assert hw["ציר סמוי 110° עם טריקה שקטה"].qty == 3 * 2 + 5  # the zone doors take 2 each
    assert hw["ציר סמוי 155° ללא בליטה"].qty == 5  # the right door, in front of the drawers
    assert hw["פין מדף"].qty == 5 * 4  # dividers rest on no pins
    assert hw["ידית מוט · נירוסטה"].qty == 5 + 2  # five doors and two drawers
    # Joints: 4 corners, 2 partitions x 2 ends, 2 dividers x 2 ends; 3 confirmat each.
    assert hw["בורג קונפירמט (אומדן)"].qty == (4 + 4 + 4) * 3
    assert hw["בורג קונפירמט (אומדן)"].spec == "3 לכל חיבור, מהם 12 ל-2 מדפים קבועים"
    # basic's 39,647 mm of banding, minus dr_left 2 x (2397 + 667) = 6128 and two shelves 2 x 641, plus the
    # zone doors 2 x (824 + 797 + 770 + 3 x 667) = 8784 and the dividers 2 x 643: 42,307 mm, +10% = 46.5 m.
    body = board_for(thirds()["carcass"]["appearance"], 18, CATALOG)
    assert prod.edge_m[body.key] == 47
    assert "מדפים קבועים בין אזורים: בעומק המחיצות, עד קו החזית." in " ".join(prod.method)
    # Two shelves became dividers and one door became three: two more parts than basic.
    assert sum(p.qty for p in prod.parts) == sum(p.qty for p in production(basic_wardrobe(), CATALOG).parts) + 2


def test_behind_sliding_doors_dividers_stop_with_the_partitions():
    design = make(sliding(2), {"op": "set_zones", "compartmentId": "cmp_a", "count": 2})
    prod = production(design, CATALOG)
    lay = layout(design)
    divider = next(p for p in prod.parts if p.name == "מדף קבוע")
    assert (divider.qty, divider.length, divider.width) == (1, lay.ranges[0][1] - lay.ranges[0][0], 600 - 100 - 13)
    assert divider.width == prod.partition_depth
    assert "מאחורי תחום המסילות" in " ".join(prod.method)
    assert all(d.anchors == (None, None) for d in lay.doors)


def test_the_mixed_column_cut_list():
    fronts = [(p.qty, p.length, p.width, p.note) for p in production(mixed(), CATALOG).parts if p.group == "חזיתות"]
    assert fronts[:2] == [(1, 824, 667, f"תא {LRI}1{PDI} · אזור 1 · 2 צירים"),
                          (2, 770, 332, f"תא {LRI}1{PDI} · אזור 3 · 2 צירים")]  # the pair is one row of two
    assert len(fronts) == 4


def test_only_the_zone_door_in_front_of_the_drawers_takes_zero_protrusion_hinges():
    design = apply_ops(basic_wardrobe(), [{"op": "set_zones", "compartmentId": "cmp_right", "count": 2}], CATALOG)
    doors = doors_by_id(design)
    # Halves: interior 2364, the new divider centred on 1182 (y 1173), its centre line 18 + 1173 + 9 = 1200.
    assert [(doors[i].y0, doors[i].height, doors[i].hinges) for i in ("dr_right_z1", "dr_right_z2")] == [
        (1.5, 1197, 3), (1201.5, 1197, 3)]
    hw = hardware(design)
    assert hw["ציר סמוי 155° ללא בליטה"] == 3  # only the lower door fronts the drawers (y 0..400)
    assert hw["ציר סמוי 110° עם טריקה שקטה"] == 5 + 5 + 3


def test_push_to_open_zone_doors_take_the_short_tip_on():
    design = make(hinged(2), {"op": "set_handles", "target": "all", "style": "none"},
                  {"op": "set_zones", "compartmentId": "cmp_a", "count": 2})
    push = next(h for h in production(design, CATALOG).hardware if h.name == "מנגנון פתיחה בלחיצה לדלת")
    assert push.qty == 3
    assert push.spec == "עם ציר ללא קפיץ, 1 בגרסה ארוכה (דלת מעל 1300 מ״מ) והשאר בקצרה"


def test_dividers_facing_across_a_partition_get_a_screw_note():
    both = make(hinged(2), {"op": "set_zones", "compartmentId": "cmp_a", "count": 2},
                {"op": "set_zones", "compartmentId": "cmp_b", "count": 2})
    assert "מסיטים את הברגים" in " ".join(production(both, CATALOG).method)
    one = make(hinged(2), {"op": "set_zones", "compartmentId": "cmp_a", "count": 2})
    assert "מסיטים את הברגים" not in " ".join(production(one, CATALOG).method)
    assert "מדפים קבועים" not in " ".join(production(make(hinged(2)), CATALOG).method)


# ---------- drawings ----------

def svg_root(markup) -> ET.Element:
    return ET.fromstring(str(markup))


def dim_labels(root: ET.Element) -> Counter:
    return Counter(t.text for t in root.iter(f"{SVG}text") if "dim-text" in t.get("class", ""))


def test_the_front_view_draws_each_zone_door_and_the_open_zone():
    design = zoned()
    lay = layout(design)
    root = svg_root(drawings.front_elevation(design, lay, CATALOG))
    fronts = [r for r in root.iter(f"{SVG}rect") if r.get("class") == "front"]
    assert len(fronts) == len(lay.doors) == 6
    marks = [c for c in root.iter(f"{SVG}circle") if c.get("class") == "hinge-mark"]
    assert len(marks) == sum(d.hinges for d in lay.doors) == 2 + 2 * 2 + 5 + 3 + 3
    # Zone 3 of the left column is open: its interior shows from the divider's centre line (1627) to the
    # interior top (18 + 2364 = 2382), with the items clipped to it.
    clip = root.find(f".//{SVG}clipPath")
    assert clip.get("id") == "fe-open0"
    assert [(r.get("x"), r.get("y"), r.get("width"), r.get("height")) for r in clip] == [("18", "1627", "643", "755")]
    clipped = root.find(f".//{SVG}g[@clip-path='url(#fe-open0)']")
    assert any("shelf--fixed" in (r.get("class") or "") for r in clipped.iter(f"{SVG}rect"))  # the divider's top half


def test_the_front_view_dimensions_zone_heights_and_door_widths_once():
    design = zoned()
    labels = dim_labels(svg_root(drawings.front_elevation(design, layout(design), CATALOG)))
    # Zone chains between divider centre lines: left 827 / 800 / 773, right 1200 / 1200 (to the divider at 1173 + 9).
    assert labels["827"] == labels["800"] == labels["773"] == 1 and labels["1200"] == 2
    # Widths: 658 and 666 over the top; the zone 1 door (667) and the pair's leaves (332) inside their top edges.
    assert labels["658"] == labels["666"] == labels["667"] == 1 and labels["332"] == 2


def test_handles_stay_on_their_zone_doors():
    design = zoned()
    lay = layout(design)
    root = svg_root(drawings.front_elevation(design, lay, CATALOG))
    centres = {}  # door id -> the centre height of its bar handle
    for bar in (r for r in root.iter(f"{SVG}rect") if r.get("class") == "handle"):
        x, y, h = float(bar.get("x")), float(bar.get("y")), float(bar.get("height"))
        door = next(d for d in lay.doors if d.x0 <= x <= d.x0 + d.width and d.y0 <= y + h / 2 <= d.y0 + d.height)
        assert door.y0 < y and y + h < door.y0 + door.height, door.id  # the whole bar is on its door
        centres[door.id] = y + h / 2
    assert len(centres) == len(lay.doors)
    # At 1050 above the floor where the door allows it. Otherwise as near as it can, its centre at least 110 mm
    # (here the bar's half + 40 = 210) from the door's end: near the top of a low door, near the bottom of a high one.
    assert centres["dr_middle"] == 1050
    assert centres["dr_right_z1"] == pytest.approx(1.5 + 1197 - 210)
    assert centres["dr_right_z2"] == pytest.approx(1201.5 + 210)


def test_dividers_are_drawn_as_structure_inside():
    design = zoned()
    lay = layout(design)
    inside = str(drawings.interior_elevation(design, lay))
    assert inside.count('class="shelf shelf--fixed"') == 3
    one = svg_root(drawings.compartment_elevation(design, lay, 0))
    assert dim_labels(one)["18"] == 1 + 2  # the bottom panel, and both faces of each divider
    assert str(drawings.exploded_view(production(design, CATALOG))).count("<polygon") > 0


def test_the_plan_draws_each_stacked_door_once():
    design = thirds()
    lay = layout(design)
    root = svg_root(drawings.plan_view(design, lay, CATALOG, production(design, CATALOG).partition_depth))
    arcs = [p for p in root.iter(f"{SVG}path") if p.get("class") == "ln-swing"]
    assert len(arcs) == 3  # the three zone doors share one swing; the middle and right doors have their own
