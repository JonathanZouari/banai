import copy
import re

import pytest

from app.advice.rules import advisories
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.domain.layout import hinges_for, layout

CATALOG = load_catalog()
TARGET = re.compile(r"^(carcass|door:dr_[A-Za-z0-9_-]+|comp:\d+)$")


def make(*ops: dict, width=1800, height=2400, depth=600, count=2, panel=17, plinth=0) -> dict:
    ids = [f"cmp_{chr(97 + i)}" for i in range(count)]
    create = {"op": "create_wardrobe", "width": width, "height": height, "depth": depth, "compartmentCount": count,
              "panelThickness": panel, "plinthHeight": plinth, "compartmentIds": ids,
              "partitionIds": [f"prt_{chr(97 + i)}" for i in range(count - 1)]}
    return apply_ops(None, [create, *ops], CATALOG)


def hinged(count=2) -> dict:
    return {"op": "configure_doors", "type": "hinged", "doors": [
        {"id": f"dr_{chr(97 + i)}", "compartmentIds": [f"cmp_{chr(97 + i)}"], "hingeSide": "left" if i % 2 == 0 else "right"}
        for i in range(count)]}


def sliding(count=2) -> dict:
    return {"op": "configure_doors", "type": "sliding", "ids": [f"dr_s{i + 1}" for i in range(count)]}


def by_id(design: dict) -> dict:
    return {a["id"]: a for a in advisories(design, CATALOG)}


# Designs that, between them, trigger every rule that offers a fix.
SAMPLES = {
    "basic": basic_wardrobe(),
    "site": make(hinged(), {"op": "set_site", "ceiling": 2420, "niche": 1810}),
    "over": make(hinged(), {"op": "set_site", "ceiling": 2300, "niche": 1700}),
    "wide": make(hinged(), {"op": "add_rail", "compartmentId": "cmp_a", "y": 1900, "id": "rail_a"},
                 {"op": "add_shelf", "compartmentId": "cmp_b", "y": 1000, "id": "shf_b"},
                 {"op": "modify_door", "id": "dr_b", "mirror": True}, width=2400),
    "slide": make(sliding(), {"op": "add_rail", "compartmentId": "cmp_a", "y": 1700, "id": "rail_a"},
                  {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_b"}),
    "pulldown": make(hinged(), {"op": "add_rail", "compartmentId": "cmp_a", "y": 2000, "id": "rail_a"}, width=1900),
    "narrow-pulldown": make(hinged(3), {"op": "add_insert", "compartmentId": "cmp_a", "type": "pulldown", "id": "ins_p"},
                            count=3),
    "inserts": make(sliding(), {"op": "add_insert", "compartmentId": "cmp_a", "type": "shoes", "id": "ins_s"},
                    {"op": "add_insert", "compartmentId": "cmp_b", "type": "trousers", "id": "ins_t"},
                    {"op": "add_insert", "compartmentId": "cmp_b", "type": "led", "id": "ins_l"},
                    {"op": "add_rail", "compartmentId": "cmp_a", "y": 1500, "id": "rail_a"}, depth=400),
    # 725 mm compartments: cmp_a in three zones, a pair in zone 2; every single door is about 75 cm wide.
    "zones": make(hinged(), {"op": "set_zones", "compartmentId": "cmp_a", "count": 3},
                   {"op": "set_zone_door", "compartmentId": "cmp_a", "zone": 2, "leaves": 2}, width=1500),
    # R21: 40 cm in front of two ~90 cm hinged doors and a drawer (sliding is the fix), and 70 cm (splitting is).
    "cramped": make(hinged(), {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_b"}, {"op": "set_site", "clearance": 400}),
    "tight": make(hinged(), {"op": "set_site", "clearance": 700}),
    # R23: a socket, an AC unit low enough to lower under, pipes and skirting behind; a window past the side.
    "obstacles": make(hinged(), {"op": "set_site", "obstacles": [{"type": "socket", "x": 300, "y": 300, "width": 80, "height": 80}, {"type": "ac", "x": 200, "y": 2000, "width": 900, "height": 300}, {"type": "pipe", "x": 1200, "y": 200, "width": 60, "height": 400}, {"type": "panel", "x": -200, "y": 0, "width": 2400, "height": 80}, {"type": "window", "x": 3000, "y": 900, "width": 1200, "height": 1300}]}),
}


@pytest.mark.parametrize("name", SAMPLES)
def test_every_advisory_follows_the_contract(name):
    items = advisories(SAMPLES[name], CATALOG)
    assert len({a["id"] for a in items}) == len(items)
    levels = [a["level"] for a in items]
    assert levels == sorted(levels, key=["critical", "warn", "info"].index)
    for a in items:
        assert set(a) - {"fix"} == {"id", "level", "title", "body", "grade", "src", "targets"}
        assert a["title"] and a["body"] and a["grade"] and a["src"]
        assert a["targets"] and all(TARGET.match(t) for t in a["targets"])


@pytest.mark.parametrize("name", SAMPLES)
def test_every_fix_applies_and_clears_its_own_advisory(name):
    design = SAMPLES[name]
    for a in advisories(design, CATALOG):
        if "fix" in a:
            after = apply_ops(design, a["fix"]["ops"], CATALOG)
            assert a["id"] not in by_id(after), a["id"]


def test_the_samples_cover_every_fix():
    fixed = {a["id"].rsplit("-", 1)[0] if a["id"][-1].isdigit() else a["id"]
             for d in SAMPLES.values() for a in advisories(d, CATALOG) if "fix" in a}
    assert fixed == {"r1-over", "r1-lift", "niche-over", "r12-filler", "r3-wide", "r6-mirror", "r5-depth", "r7-sag",
                     "r8-rail", "r16-high", "r16-width", "r21-swing", "r23"}


def test_advisories_do_not_touch_the_design():
    design = SAMPLES["wide"]
    before = copy.deepcopy(design)
    advisories(design, CATALOG)
    assert design == before


def test_site_rules_need_a_site():
    ids = by_id(make(hinged()))
    assert not {i for i in ids if i.startswith(("r1-", "r12-", "niche-", "r21-", "r22-"))}


def test_room_to_open_hinged_doors_and_drawers():
    cramped = by_id(SAMPLES["cramped"])
    assert cramped["r21-swing"]["level"] == "warn" and cramped["r21-drawer"]["level"] == "warn"
    assert cramped["r21-swing"]["fix"]["ops"][0]["type"] == "sliding"  # under ~50 cm: sliding [99]
    assert cramped["r21-swing"]["targets"] == ["door:dr_a", "door:dr_b"]
    assert "ויש 40 ס״מ" in cramped["r21-swing"]["body"]
    tight = by_id(SAMPLES["tight"])
    assert [op["op"] for op in tight["r21-swing"]["fix"]["ops"]] == ["split_door", "split_door"]  # leaves of ~45 cm fit
    roomy = by_id(make(hinged(), {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_b"},
                       {"op": "set_site", "clearance": 950}))
    assert roomy["r21-hinged"]["level"] == "info" and "r21-swing" not in roomy
    assert roomy["r21-drawer-pass"]["level"] == "info"  # 95 - 55 = 40 cm behind an open drawer
    assert not {i for i in by_id(make(hinged(), {"op": "set_site", "clearance": 1500})) if i.startswith("r21-")}


def test_room_to_pass_without_doors_or_drawers():
    narrow = by_id(make({"op": "set_site", "clearance": 500}))
    assert narrow["r21-pass"]["level"] == "info" and "50 ס״מ" in narrow["r21-pass"]["title"] + narrow["r21-pass"]["body"]
    assert "r21-pass" not in by_id(make({"op": "set_site", "clearance": 700}))


def test_wall_obstacles_behind_the_wardrobe():
    found = by_id(SAMPLES["obstacles"])
    assert found["r23-1"]["level"] == "info" and found["r23-1"]["title"] == "שקע מאחורי הארון"
    assert found["r23-2"]["level"] == "warn" and found["r23-2"]["title"] == "מזגן בתחום הארון"
    assert found["r23-2"]["fix"]["ops"] == [{"op": "update_dimensions", "height": 1990}]  # 1 cm under the AC unit
    assert found["r23-3"]["level"] == "warn" and "לא מעגנים מעל הצנרת" in found["r23-3"]["body"]
    assert found["r23-4"]["title"] == "פנל לאורך הקיר"
    assert "r23-5" not in found  # the window is beside the wardrobe, not behind it
    low = by_id(make(hinged(), {"op": "set_site", "obstacles": [{"type": "window", "x": 0, "y": 900, "width": 600, "height": 1200}]}))
    assert low["r23-1"]["level"] == "warn" and "fix" not in low["r23-1"]  # a 89 cm wardrobe is no wardrobe: no fix
    assert not {i for i in by_id(make(hinged())) if i.startswith("r23")}


def test_an_out_of_square_niche():
    crooked = by_id(make(hinged(), {"op": "set_site", "widths": [1900, 1870, 1895], "heights": [2600, 2570, 2590]}))
    assert crooked["r22-walls"]["title"] == "הנישה לא ישרה: הפרש של 30 מ״מ"
    assert "בין 187 ל-190 ס״מ" in crooked["r22-walls"]["body"]
    assert crooked["r22-ceiling"]["level"] == "info" and "257 ס״מ" in crooked["r22-ceiling"]["body"]
    track = by_id(make(sliding(), {"op": "set_site", "heights": [2600, 2580, None]}))
    assert track["r22-track"]["level"] == "warn" and "r22-ceiling" not in track  # 20 mm along a sliding track [11]
    square = by_id(make(sliding(), {"op": "set_site", "widths": [1900, 1890, None], "heights": [2600, 2590, 2595]}))
    assert not {i for i in square if i.startswith("r22-")}  # 10 mm is within the rule of thumb
    single = by_id(make(hinged(), {"op": "set_site", "widths": [1900, None, None]}))
    assert "r22-walls" not in single  # one reading cannot be out of square


def test_ceiling_and_niche():
    over = by_id(SAMPLES["over"])
    assert over["r1-over"]["level"] == "critical" and over["niche-over"]["level"] == "critical"
    lift = by_id(SAMPLES["site"])["r1-lift"]  # diagonal of 2400 x 600 is 247.4 cm
    assert lift["fix"]["ops"] == [{"op": "update_dimensions", "height": 2330}]
    assert by_id(SAMPLES["site"])["r12-filler"]["level"] == "warn"  # 1 cm left beside a hinged door
    roomy = by_id(make(hinged(), {"op": "set_site", "ceiling": 2700, "niche": 2000}))
    assert {"r1-gap", "r12-gap"} <= set(roomy)
    assert "פילר 10 ס״מ בכל צד" == roomy["r12-gap"]["title"]


def test_a_fix_the_engine_would_reject_is_not_offered():
    # Lowering under this ceiling would leave the rail outside the interior.
    design = make(hinged(), {"op": "add_rail", "compartmentId": "cmp_a", "y": 2300, "id": "rail_a"},
                  {"op": "set_site", "ceiling": 2000})
    assert "fix" not in by_id(design)["r1-over"]


@pytest.mark.parametrize(("width", "level"), [(600, None), (640, "info"), (700, "warn")])
def test_hinged_door_width(width, level):
    ids = by_id(make(hinged(1), width=width, count=1))
    assert (ids["r3-wide"]["level"] if "r3-wide" in ids else None) == level


def test_split_leaves_halve_the_door():
    design = make(hinged(1), {"op": "split_door", "id": "dr_a", "newId": "dr_a_2"}, width=1000, count=1)
    left, right = layout(design).doors
    assert (left.x0, left.width) == (1.5, 497.0) and (right.x0, right.width) == (501.5, 497.0)
    assert "r3-wide" not in by_id(design)


def test_full_overlay_doors_cover_the_front():
    doors = layout(make(hinged(3), width=2000, count=3)).doors
    assert sum(d.width for d in doors) + 3 * len(doors) == 2000
    assert all(abs(a.x0 + a.width + 3 - b.x0) < 1e-9 for a, b in zip(doors, doors[1:]))


@pytest.mark.parametrize(("height", "kg", "hinges"), [(800, 5, 2), (1500, 5, 3), (2000, 10, 4), (2400, 10, 5),
                                                      (2000, 25, 5), (1000, 30, 6)])
def test_hinge_count_takes_the_stricter_of_height_and_weight(height, kg, hinges):
    assert hinges_for(height, kg) == hinges


def test_mirror_door_weight():
    ids = by_id(SAMPLES["wide"])
    assert ids["r6-mirror"]["targets"] == ["door:dr_b"]
    assert ids["r6-mirror"]["fix"]["ops"][0]["ids"] == ["dr_s1", "dr_s2", "dr_s3"]  # 3 panels over 2 m
    assert "r6-safety" in ids


def test_sliding_depth_and_access():
    ids = by_id(SAMPLES["slide"])
    assert ids["r5-depth"]["fix"]["ops"] == [{"op": "update_dimensions", "depth": 700}]
    assert ids["r5-open"]["title"].startswith("2 ")
    assert "r10-slide" not in ids  # the overlap sits over the partition, clear of the drawer box


def test_drawers_inside_the_sliding_overlap():
    # One compartment behind two panels: the overlap runs through the middle of the drawers.
    design = make(sliding(), {"op": "add_drawer", "compartmentId": "cmp_a", "y": 0, "height": 200, "id": "drw_a"},
                  count=1, width=1200)
    assert by_id(design)["r10-slide"]["targets"] == ["comp:0"]


def test_drawers_behind_hinged_doors_and_runners():
    ids = by_id(SAMPLES["basic"])
    assert ids["r10-hinge"]["targets"] == ids["r11-runner"]["targets"] == ["comp:2"]


def test_spans():
    ids = by_id(SAMPLES["wide"])  # compartments of about 117 cm
    assert ids["r7-sag"]["targets"] == ["comp:1"] and ids["r8-rail"]["level"] == "warn"
    support = by_id(make(hinged(), {"op": "add_rail", "compartmentId": "cmp_a", "y": 1500, "id": "rail_a"}, width=1900))
    assert support["r8-rail"]["level"] == "info" and "fix" not in support["r8-rail"]


def test_high_rail_suggests_a_pulldown_only_where_one_fits():
    swap = by_id(SAMPLES["pulldown"])["r16-high-0"]["fix"]["ops"]
    after = apply_ops(SAMPLES["pulldown"], swap, CATALOG)
    assert after["compartments"][0]["rails"] == []
    assert after["compartments"][0]["inserts"][0]["type"] == "pulldown"
    basic = by_id(SAMPLES["basic"])["r16-high-1"]  # a 64 cm compartment: no pull-down is that narrow
    assert "fix" not in basic and "83–115" in basic["body"]


def test_pulldown_in_a_narrow_compartment():
    item = by_id(SAMPLES["narrow-pulldown"])["r16-width-0"]
    assert item["level"] == "warn"
    assert item["fix"]["ops"] == [{"op": "remove_component", "id": "ins_p"}]


def test_inserts():
    ids = by_id(SAMPLES["inserts"])
    assert ids["r17-shoes-0"]["level"] == "warn"  # 29 cm shelves behind sliding doors, under the 35 cm minimum
    assert ids["r17-shoes-0"]["title"].startswith("9 ")  # 3 tiers x 3 pairs (22 cm each) across 87.5 cm
    assert ids["r18-trousers-1"]["level"] == "info"
    assert ids["r19-led"]["targets"] == ["comp:1"]


def test_hanging_zone_is_measured_down_to_the_nearest_item():
    ids = by_id(SAMPLES["inserts"])  # rail at 1500 over 3 shoe tiers (720): 78 cm
    assert ids["r9-short-0"]["level"] == "warn" and "78" in ids["r9-short-0"]["body"]
    shirts = by_id(make(hinged(), {"op": "add_rail", "compartmentId": "cmp_a", "y": 1200, "id": "rail_a"}))
    assert "r9-long-0" in shirts


def test_board_thickness():
    assert by_id(make(hinged()))["r2-board"]["title"] == "לוח 17 מ״מ"
    assert by_id(make(hinged(), panel=18))["r2-board"]["title"] == "לוח 18 מ״מ"


def test_plinth_raises_the_floor_height():
    rail = {"op": "add_rail", "compartmentId": "cmp_a", "y": 1850, "id": "rail_a"}
    assert "r16-high-0" not in by_id(make(hinged(), rail, width=1900))
    assert "r16-high-0" in by_id(make(hinged(), rail, width=1900, plinth=80))


# ---------- zones ----------

def thirds() -> dict:
    """basic with its left compartment in thirds: dr_left becomes three zone doors of 82.4, 79.7 and 77 cm."""
    return apply_ops(basic_wardrobe(), [{"op": "set_zones", "compartmentId": "cmp_left", "count": 3}], CATALOG)


def test_a_zone_door_alone_in_its_zone_can_be_split():
    design = SAMPLES["zones"]
    r3 = by_id(design)["r3-wide"]
    assert r3["level"] == "warn"
    assert r3["targets"] == ["door:dr_a_z1", "door:dr_a_z3", "door:dr_b"]  # the zone 2 leaves are 37 cm
    # Each wide door is alone in its (compartment, anchors) group, so each is split, the zone doors included.
    assert r3["fix"]["ops"] == [{"op": "split_door", "id": i, "newId": f"{i}_2"} for i in ("dr_a_z1", "dr_a_z3", "dr_b")]
    after = apply_ops(design, r3["fix"]["ops"], CATALOG)
    assert len(after["doors"]["items"]) == 5 + 3 and "r3-wide" not in by_id(after)
    assert {(d.id, d.width) for d in layout(after).doors if d.anchors == (None, "shf_a_z1")} == {
        ("dr_a_z1", 372.25), ("dr_a_z1_2", 372.25)}  # 0 .. 17 + 725 + 8.5 = 750.5, halved, minus 3


def test_split_ids_never_clash():
    design = make({"op": "configure_doors", "type": "hinged", "doors": [
        {"id": "dr_a", "compartmentIds": ["cmp_a"], "hingeSide": "left"},
        {"id": "dr_a_2", "compartmentIds": ["cmp_b"], "hingeSide": "right"}]}, width=1500)
    assert [op["newId"] for op in by_id(design)["r3-wide"]["fix"]["ops"]] == ["dr_a_2_2", "dr_a_2_2_2"]


def test_hinges_are_counted_per_zone_door():
    r4 = by_id(thirds())["r4-hinges"]
    assert r4["title"] == "2–5 צירים לדלת, לפי הגובה"
    assert r4["body"].endswith("הגבוה מביניהם: 239.7 ס״מ – 5, 82.4 ס״מ – 2, 79.7 ס״מ – 2, 77 ס״מ – 2.")
    assert len(r4["targets"]) == 5
    assert by_id(basic_wardrobe())["r4-hinges"]["title"] == "5 צירים לכל דלת"  # one height: as before


def test_drawers_in_an_open_zone_need_no_hinge_clearance():
    halves = apply_ops(basic_wardrobe(), [{"op": "set_zones", "compartmentId": "cmp_right", "count": 2}], CATALOG)
    assert by_id(halves)["r10-hinge"]["targets"] == ["comp:2"]  # the zone 1 door fronts the drawers
    opened = apply_ops(halves, [{"op": "set_zone_door", "compartmentId": "cmp_right", "zone": 1, "leaves": 0}], CATALOG)
    assert "r10-hinge" not in by_id(opened)


def test_dividers_are_explained():
    item = by_id(SAMPLES["zones"])["r20-dividers"]
    assert (item["level"], item["title"], item["src"], item["targets"]) == (
        "info", "2 מדפים קבועים בין אזורים", "[26][29]", ["comp:0"])
    assert "fix" not in item and "קונפירמט" in item["body"]
    assert by_id(make(hinged(1), {"op": "set_zones", "compartmentId": "cmp_a", "count": 2}, count=1, width=600))[
        "r20-dividers"]["title"] == "מדף קבוע בין אזורים"
    assert "r20-dividers" not in by_id(make(hinged()))


@pytest.mark.parametrize(("width", "shelf", "sag"), [(950, False, False), (950, True, True), (1100, False, True)])
def test_fixed_ends_let_a_divider_span_further(width, shelf, sag):
    # 950 mm: a 916 mm compartment, past 80 cm for a shelf on pins but within 100 cm for a fixed one [26].
    ops = [{"op": "set_zones", "compartmentId": "cmp_a", "count": 2}]
    ops += [{"op": "add_shelf", "compartmentId": "cmp_a", "y": 400, "id": "shf_x"}] if shelf else []
    assert ("r7-sag" in by_id(make(hinged(1), *ops, width=width, count=1))) == sag
