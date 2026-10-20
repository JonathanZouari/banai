"""Configurable prototype defaults.

ASSUMPTION: every value in this module is a configurable prototype default for
rendering safety and convenience, NOT an approved business or manufacturing
rule. Mirrored in frontend/src/domain/defaults.js.
"""

import math


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
    # schema v2
    "plinthHeight": (0, 300),
    "ceiling": (1500, 5000),
    "niche": (300, 10000),
    "clearance": (100, 10000),  # free floor in front of the wardrobe
    "personHeight": (450, 2300),  # a household member, for scale and child safety
    "releaseHeight": (900, 2200),  # the child lock's release button, above the floor
    # wall obstacles: x from the wardrobe's left outer face (may be left of it), y from the floor
    "obstacleX": (-5000, 10000),
    "obstacleY": (0, 5000),
    "obstacleSize": (10, 5000),
    # the room (ADR-037): a template's overall size, its parts (a cut, a recess) and where the wardrobe stands
    "roomSize": (1000, 15000),
    "roomPart": (300, 14700),
    "roomOffset": (0, 15000),
    # openings in the room's walls: from the wall's left end, their size, and a window's sill above the floor
    "openingAt": (0, 15000),
    "openingWidth": (300, 5000),
    "openingHeight": (300, 3000),
    "openingSill": (0, 2500),
    "shoeTiers": (1, 6),
    "insertHeight": (200, 1500),
    "zones": (1, 4),
}

MAX_OBSTACLES = 8  # wall obstacles in one site
MAX_OPENINGS = 8  # doors, windows and passages in one room (ADR-037)
# Which limit each obstacle field takes.
OBSTACLE_LIMITS = {"x": "obstacleX", "y": "obstacleY", "width": "obstacleSize", "height": "obstacleSize"}

DEFAULT_PANEL_THICKNESS = 18

# Child safety (prototype defaults, not research values): a person under CHILD_HEIGHT counts as a child; the
# lock's release goes at least RELEASE_MIN above the floor and above the tallest child's overhead reach,
# estimated as 1.3 x height, rounded up to 50 mm.
CHILD_HEIGHT = 1400
RELEASE_MIN = 1500


def release_height_for(people: list[dict]) -> int:
    """Where a lock's release button goes so the household's children cannot reach it (mm above the floor)."""
    children = [p["height"] for p in people if p["height"] < CHILD_HEIGHT]
    reach = -(-(max(children) * 13) // 500) * 50 if children else 0  # ceil(1.3 x height / 50) x 50
    return max(RELEASE_MIN, reach)
DEFAULT_SHELF_THICKNESS = 18
DEFAULT_SLIDING_DOOR_COUNT = 2
DEFAULT_PLINTH_HEIGHT = 0  # no plinth unless asked for; new designs from the UI pass one explicitly

# Schema v2 interior inserts. A shoe tier is 220-260 mm in the research [35].
SHOE_TIER = 240
DEFAULT_SHOE_TIERS = 3
DEFAULT_TROUSER_HEIGHT = 700
PULLDOWN_DROP = 400  # default pull-down rail height below the interior top
# A flat screen insert: 16:9, sized by its diagonal in inches. Its centre defaults to a seated viewing height.
TV_DEFAULT_INCHES = 43
TV_CENTER_HEIGHT = 1100  # mm above the floor, a prototype default


def screen_height(inches: float) -> int:
    """The height (mm) of a 16:9 screen with this diagonal: d x 25.4 x 9 / sqrt(16^2 + 9^2)."""
    return int(inches * 25.4 * 9 / 337 ** 0.5 + 0.5)


def screen_width(height: float) -> int:
    return int(height * 16 / 9 + 0.5)


def screen_inches(height: float) -> int:
    return int(height * 337 ** 0.5 / (25.4 * 9) + 0.5)


def default_screen_inches(compartment_width: int) -> int:
    """The largest screen up to TV_DEFAULT_INCHES that leaves 100 mm of air each side [research 118], at least 24."""
    fits = largest_screen(compartment_width)
    return max(24, min(TV_DEFAULT_INCHES, fits))


def largest_screen(compartment_width: int) -> int:
    """The largest whole-inch screen whose real width leaves 100 mm of air each side (0 when none does)."""
    fits = max(0, math.floor((compartment_width - 200) * 337 ** 0.5 / (25.4 * 16)))
    while fits > 0 and screen_width(screen_height(fits)) > compartment_width - 200:
        fits -= 1
    return fits


def default_handles() -> dict:
    """Root handle style/finish of a new design (doors and drawers inherit it)."""
    return {"style": "bar", "finish": "steel"}


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
