"""Configurable prototype defaults.

ASSUMPTION: every value in this module is a configurable prototype default for
rendering safety and convenience, NOT an approved business or manufacturing
rule. Mirrored in frontend/src/domain/defaults.js.
"""

# (min, max) inclusive, in millimetres unless noted.
LIMITS: dict[str, tuple[int, int]] = {
    "width": (300, 6000),
    "height": (300, 3500),
    "depth": (200, 1200),
    "panelThickness": (5, 50),
    "partitionThickness": (5, 50),
    "compartmentWidth": (50, 6000),
    "shelfThickness": (5, 60),
    "drawerHeight": (50, 1000),
    "compartmentCount": (1, 20),
    "slidingDoorCount": (1, 6),
}

DEFAULT_PANEL_THICKNESS = 18
DEFAULT_SHELF_THICKNESS = 18
DEFAULT_SLIDING_DOOR_COUNT = 2


def default_appearance() -> dict:
    return {
        "material": {"catalogId": "melamine"},
        "color": {"catalogId": "white"},
        "finish": {"catalogId": "matte"},
    }


BASIC_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 2000, "height": 2400, "depth": 600, "compartmentCount": 3,
     "compartmentIds": ["cmp_left", "cmp_middle", "cmp_right"], "partitionIds": ["prt_1", "prt_2"]},
    {"op": "add_shelf", "compartmentId": "cmp_left", "y": 400, "id": "shf_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_left", "y": 800, "id": "shf_l2"},
    {"op": "add_shelf", "compartmentId": "cmp_left", "y": 1200, "id": "shf_l3"},
    {"op": "add_shelf", "compartmentId": "cmp_left", "y": 1600, "id": "shf_l4"},
    {"op": "add_shelf", "compartmentId": "cmp_middle", "y": 2000, "id": "shf_m1"},
    {"op": "add_rail", "compartmentId": "cmp_middle", "y": 1900, "id": "rail_m1"},
    {"op": "add_shelf", "compartmentId": "cmp_right", "y": 800, "id": "shf_r1"},
    {"op": "add_shelf", "compartmentId": "cmp_right", "y": 1400, "id": "shf_r2"},
    {"op": "add_drawer", "compartmentId": "cmp_right", "y": 0, "height": 200, "id": "drw_r1"},
    {"op": "add_drawer", "compartmentId": "cmp_right", "y": 200, "height": 200, "id": "drw_r2"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_left", "dr_middle", "dr_right"]},
]


# Child-height rail and reachable shelves.
KIDS_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1500, "height": 2000, "depth": 550, "compartmentCount": 2,
     "compartmentIds": ["cmp_hang", "cmp_store"], "partitionIds": ["prt_1"]},
    {"op": "add_rail", "compartmentId": "cmp_hang", "y": 1200, "id": "rail_h1"},
    {"op": "add_shelf", "compartmentId": "cmp_hang", "y": 1300, "id": "shf_h1"},
    {"op": "add_shelf", "compartmentId": "cmp_hang", "y": 1650, "id": "shf_h2"},
    {"op": "add_drawer", "compartmentId": "cmp_store", "y": 0, "height": 200, "id": "drw_s1"},
    {"op": "add_drawer", "compartmentId": "cmp_store", "y": 200, "height": 200, "id": "drw_s2"},
    {"op": "add_shelf", "compartmentId": "cmp_store", "y": 700, "id": "shf_s1"},
    {"op": "add_shelf", "compartmentId": "cmp_store", "y": 1000, "id": "shf_s2"},
    {"op": "add_shelf", "compartmentId": "cmp_store", "y": 1300, "id": "shf_s3"},
    {"op": "add_shelf", "compartmentId": "cmp_store", "y": 1650, "id": "shf_s4"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_hang", "dr_store"]},
    {"op": "set_material", "target": "doors", "color": {"catalogId": "natural_oak"}},
]

# Two hanging sections around a central drawer and shelf stack.
DOUBLE_SLIDING_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 2400, "height": 2400, "depth": 650, "compartmentCount": 3,
     "compartmentIds": ["cmp_left", "cmp_middle", "cmp_right"], "partitionIds": ["prt_1", "prt_2"]},
    {"op": "add_rail", "compartmentId": "cmp_left", "y": 1900, "id": "rail_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_left", "y": 2000, "id": "shf_l1"},
    {"op": "add_drawer", "compartmentId": "cmp_middle", "y": 0, "height": 200, "id": "drw_m1"},
    {"op": "add_drawer", "compartmentId": "cmp_middle", "y": 200, "height": 200, "id": "drw_m2"},
    {"op": "add_drawer", "compartmentId": "cmp_middle", "y": 400, "height": 200, "id": "drw_m3"},
    {"op": "add_shelf", "compartmentId": "cmp_middle", "y": 1000, "id": "shf_m1"},
    {"op": "add_shelf", "compartmentId": "cmp_middle", "y": 1400, "id": "shf_m2"},
    {"op": "add_shelf", "compartmentId": "cmp_middle", "y": 1800, "id": "shf_m3"},
    {"op": "add_rail", "compartmentId": "cmp_right", "y": 1900, "id": "rail_r1"},
    {"op": "add_shelf", "compartmentId": "cmp_right", "y": 2000, "id": "shf_r1"},
    {"op": "configure_doors", "type": "sliding", "ids": ["dr_a", "dr_b"]},
    {"op": "set_material", "target": "doors", "color": {"catalogId": "light_grey"}, "finish": {"catalogId": "satin"}},
]

MINIMALIST_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1800, "height": 2400, "depth": 600, "compartmentCount": 2,
     "compartmentIds": ["cmp_left", "cmp_right"], "partitionIds": ["prt_1"]},
    {"op": "add_rail", "compartmentId": "cmp_left", "y": 1900, "id": "rail_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_left", "y": 2000, "id": "shf_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_right", "y": 600, "id": "shf_r1"},
    {"op": "add_shelf", "compartmentId": "cmp_right", "y": 1200, "id": "shf_r2"},
    {"op": "add_shelf", "compartmentId": "cmp_right", "y": 1800, "id": "shf_r3"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_left", "dr_right"]},
    {"op": "set_material", "target": "carcass", "material": {"catalogId": "lacquered_mdf"},
     "color": {"catalogId": "anthracite"}},
    {"op": "set_material", "target": "doors", "material": {"catalogId": "lacquered_mdf"},
     "color": {"catalogId": "anthracite"}},
]

# Shallow: coats on one side, shoe shelves on the other.
HALLWAY_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1200, "height": 2200, "depth": 400, "compartmentCount": 2,
     "compartmentIds": ["cmp_coats", "cmp_shoes"], "partitionIds": ["prt_1"]},
    {"op": "add_rail", "compartmentId": "cmp_coats", "y": 1700, "id": "rail_c1"},
    {"op": "add_shelf", "compartmentId": "cmp_coats", "y": 1800, "id": "shf_c1"},
    *({"op": "add_shelf", "compartmentId": "cmp_shoes", "y": y, "id": f"shf_s{k}"}
      for k, y in enumerate([250, 500, 750, 1000, 1400, 1800], start=1)),
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_coats", "dr_shoes"]},
]

OPEN_SHELVING_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1600, "height": 2000, "depth": 400, "compartmentCount": 3,
     "compartmentIds": ["cmp_left", "cmp_middle", "cmp_right"], "partitionIds": ["prt_1", "prt_2"]},
    *({"op": "add_shelf", "compartmentId": cmp, "y": y, "id": f"shf_{side}{k}"}
      for side, cmp in [("l", "cmp_left"), ("m", "cmp_middle"), ("r", "cmp_right")]
      for k, y in enumerate([400, 800, 1200, 1600], start=1)),
    {"op": "configure_doors", "type": "none"},
    {"op": "set_material", "target": "carcass", "material": {"catalogId": "oak_veneer"},
     "color": {"catalogId": "natural_oak"}},
]

# The starting templates offered on the start screen. Mirrors PRESETS in frontend/src/domain/presets.js.
PRESETS: dict[str, list[dict]] = {
    "basic": BASIC_WARDROBE_OPS,
    "kids": KIDS_WARDROBE_OPS,
    "double_sliding": DOUBLE_SLIDING_OPS,
    "minimalist": MINIMALIST_OPS,
    "hallway": HALLWAY_OPS,
    "open_shelving": OPEN_SHELVING_OPS,
}


def build_preset(preset_id: str) -> dict:
    """Build a starting template through the op protocol. Raises KeyError for an unknown id."""
    from app.domain.apply import apply_ops  # local import: apply depends on this module
    from app.domain.catalog import load_catalog

    return apply_ops(None, PRESETS[preset_id], load_catalog())


def basic_wardrobe() -> dict:
    """The predefined starting wardrobe (entry option 3). Built through the op protocol."""
    return build_preset("basic")
