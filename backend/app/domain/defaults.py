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
    "doorShelfDepth": (60, 150),
}

DEFAULT_PANEL_THICKNESS = 18
DEFAULT_SHELF_THICKNESS = 18
DEFAULT_SLIDING_DOOR_COUNT = 2
# Shelves on the inside face of a hinged door: board thickness (visual + overlap span) and depth.
DOOR_SHELF_THICKNESS = 12
DEFAULT_DOOR_SHELF_DEPTH = 100


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
