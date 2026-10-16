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
                     "r8-rail", "r16-high", "r16-width"}


def test_advisories_do_not_touch_the_design():
    design = SAMPLES["wide"]
    before = copy.deepcopy(design)
    advisories(design, CATALOG)
    assert design == before


def test_site_rules_need_a_site():
    ids = by_id(make(hinged()))
    assert not {i for i in ids if i.startswith(("r1-", "r12-", "niche-"))}


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
