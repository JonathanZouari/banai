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


# Starting templates: mirrors KIDS_/DOUBLE_SLIDING_/MINIMALIST_WARDROBE_OPS in
# frontend/src/domain/presets.js. Configurable prototype layouts, not business data.
KIDS_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1000, "height": 1500, "depth": 500, "compartmentCount": 2,
     "compartmentIds": ["cmp_kl", "cmp_kr"], "partitionIds": ["prt_k1"]},
    {"op": "add_drawer", "compartmentId": "cmp_kl", "y": 0, "height": 250, "id": "drw_k1"},
    {"op": "add_rail", "compartmentId": "cmp_kl", "y": 1050, "id": "rail_k1"},
    {"op": "add_shelf", "compartmentId": "cmp_kl", "y": 1150, "id": "shf_k1"},
    {"op": "add_shelf", "compartmentId": "cmp_kr", "y": 350, "id": "shf_k2"},
    {"op": "add_shelf", "compartmentId": "cmp_kr", "y": 700, "id": "shf_k3"},
    {"op": "add_shelf", "compartmentId": "cmp_kr", "y": 1050, "id": "shf_k4"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_kl", "dr_kr"]},
    {"op": "set_material", "target": "doors", "color": {"catalogId": "sage_green"}},
]

DOUBLE_SLIDING_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 2200, "height": 2400, "depth": 650, "compartmentCount": 2,
     "compartmentIds": ["cmp_dl", "cmp_dr"], "partitionIds": ["prt_d1"]},
    {"op": "add_rail", "compartmentId": "cmp_dl", "y": 1900, "id": "rail_dl"},
    {"op": "add_shelf", "compartmentId": "cmp_dl", "y": 2000, "id": "shf_dl"},
    {"op": "add_rail", "compartmentId": "cmp_dr", "y": 950, "id": "rail_dd"},
    {"op": "add_rail", "compartmentId": "cmp_dr", "y": 1950, "id": "rail_du"},
    {"op": "add_shelf", "compartmentId": "cmp_dr", "y": 2050, "id": "shf_dr"},
    {"op": "configure_doors", "type": "sliding", "count": 2, "ids": ["dr_s1", "dr_s2"]},
    {"op": "set_material", "target": "doors", "material": {"catalogId": "oak_veneer"},
     "color": {"catalogId": "natural_oak"}},
]

MINIMALIST_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1200, "height": 2200, "depth": 600, "compartmentCount": 2,
     "compartmentIds": ["cmp_ml", "cmp_mr"], "partitionIds": ["prt_m1"]},
    {"op": "add_rail", "compartmentId": "cmp_ml", "y": 1700, "id": "rail_ml"},
    {"op": "add_shelf", "compartmentId": "cmp_ml", "y": 1800, "id": "shf_ml"},
    {"op": "add_shelf", "compartmentId": "cmp_mr", "y": 500, "id": "shf_m1"},
    {"op": "add_shelf", "compartmentId": "cmp_mr", "y": 1000, "id": "shf_m2"},
    {"op": "add_shelf", "compartmentId": "cmp_mr", "y": 1500, "id": "shf_m3"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_ml", "dr_mr"]},
    {"op": "set_material", "target": "doors", "color": {"catalogId": "light_grey"},
     "finish": {"catalogId": "satin"}},
]

# Template id -> its ops, in gallery order.
TEMPLATE_OPS: dict[str, list[dict]] = {
    "basic": BASIC_WARDROBE_OPS,
    "kids": KIDS_WARDROBE_OPS,
    "double": DOUBLE_SLIDING_WARDROBE_OPS,
    "minimal": MINIMALIST_WARDROBE_OPS,
}


def build_template(template_id: str) -> dict:
    """Build a starting template through the op protocol. Raises KeyError for an unknown id."""
    from app.domain.apply import apply_ops  # local import: apply depends on this module
    from app.domain.catalog import load_catalog

    return apply_ops(None, TEMPLATE_OPS[template_id], load_catalog())


def basic_wardrobe() -> dict:
    """The predefined starting wardrobe (entry option 3). Built through the op protocol."""
    from app.domain.apply import apply_ops  # local import: apply depends on this module
    from app.domain.catalog import load_catalog

    return apply_ops(None, BASIC_WARDROBE_OPS, load_catalog())
