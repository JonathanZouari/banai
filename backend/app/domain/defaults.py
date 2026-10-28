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


def basic_wardrobe() -> dict:
    """The predefined starting wardrobe (entry option 3). Built through the op protocol."""
    from app.domain.apply import apply_ops  # local import: apply depends on this module
    from app.domain.catalog import load_catalog

    return apply_ops(None, BASIC_WARDROBE_OPS, load_catalog())


# Starting templates (prototype placeholders, not business data). Mirrors frontend/src/domain/presets.js;
# both sides are checked against shared/fixtures/designs/template_*.json.
KIDS_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1500, "height": 1800, "depth": 500, "compartmentCount": 2,
     "compartmentIds": ["cmp_k_left", "cmp_k_right"], "partitionIds": ["prt_k1"]},
    {"op": "add_rail", "compartmentId": "cmp_k_left", "y": 1350, "id": "rail_k1"},
    {"op": "add_shelf", "compartmentId": "cmp_k_left", "y": 1500, "id": "shf_k_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_k_right", "y": 600, "id": "shf_k_r1"},
    {"op": "add_shelf", "compartmentId": "cmp_k_right", "y": 1000, "id": "shf_k_r2"},
    {"op": "add_shelf", "compartmentId": "cmp_k_right", "y": 1400, "id": "shf_k_r3"},
    {"op": "add_drawer", "compartmentId": "cmp_k_right", "y": 0, "height": 200, "id": "drw_k_r1"},
    {"op": "add_drawer", "compartmentId": "cmp_k_right", "y": 200, "height": 200, "id": "drw_k_r2"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_k_left", "dr_k_right"]},
]

DOUBLE_SLIDING_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 2400, "height": 2400, "depth": 600, "compartmentCount": 3,
     "compartmentIds": ["cmp_d_left", "cmp_d_middle", "cmp_d_right"], "partitionIds": ["prt_d1", "prt_d2"]},
    {"op": "add_rail", "compartmentId": "cmp_d_left", "y": 1900, "id": "rail_d_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_d_left", "y": 2000, "id": "shf_d_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_d_middle", "y": 600, "id": "shf_d_m1"},
    {"op": "add_shelf", "compartmentId": "cmp_d_middle", "y": 1000, "id": "shf_d_m2"},
    {"op": "add_shelf", "compartmentId": "cmp_d_middle", "y": 1400, "id": "shf_d_m3"},
    {"op": "add_shelf", "compartmentId": "cmp_d_middle", "y": 1800, "id": "shf_d_m4"},
    {"op": "add_drawer", "compartmentId": "cmp_d_middle", "y": 0, "height": 200, "id": "drw_d_m1"},
    {"op": "add_drawer", "compartmentId": "cmp_d_middle", "y": 200, "height": 200, "id": "drw_d_m2"},
    {"op": "add_rail", "compartmentId": "cmp_d_right", "y": 1900, "id": "rail_d_r1"},
    {"op": "add_shelf", "compartmentId": "cmp_d_right", "y": 2000, "id": "shf_d_r1"},
    {"op": "configure_doors", "type": "sliding", "count": 3, "ids": ["dr_d_1", "dr_d_2", "dr_d_3"]},
]

MINIMALIST_WARDROBE_OPS: list[dict] = [
    {"op": "create_wardrobe", "width": 1800, "height": 2400, "depth": 500, "compartmentCount": 2,
     "compartmentIds": ["cmp_m_left", "cmp_m_right"], "partitionIds": ["prt_m1"]},
    {"op": "add_rail", "compartmentId": "cmp_m_left", "y": 2200, "id": "rail_m_l1"},
    {"op": "add_shelf", "compartmentId": "cmp_m_right", "y": 600, "id": "shf_m_r1"},
    {"op": "add_shelf", "compartmentId": "cmp_m_right", "y": 1200, "id": "shf_m_r2"},
    {"op": "add_shelf", "compartmentId": "cmp_m_right", "y": 1800, "id": "shf_m_r3"},
    {"op": "configure_doors", "type": "hinged", "ids": ["dr_m_left", "dr_m_right"]},
]

# Template id -> ops (`basic` first). The ids match the frontend TEMPLATES and the fixture file names.
TEMPLATE_OPS: dict[str, list[dict]] = {
    "basic": BASIC_WARDROBE_OPS,
    "kids": KIDS_WARDROBE_OPS,
    "double-sliding": DOUBLE_SLIDING_WARDROBE_OPS,
    "minimalist": MINIMALIST_WARDROBE_OPS,
}


def build_template(template_id: str) -> dict:
    """A starting template, built through the op protocol. Raises KeyError for an unknown id."""
    from app.domain.apply import apply_ops  # local import: apply depends on this module
    from app.domain.catalog import load_catalog

    return apply_ops(None, TEMPLATE_OPS[template_id], load_catalog())
