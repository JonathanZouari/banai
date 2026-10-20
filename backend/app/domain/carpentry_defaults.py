"""Construction assumptions for the carpenter instructions (scope change 2026-10-20).

ASSUMPTION: every value here is a configurable prototype default chosen to produce a
plausible cut list. None of them is an approved business, engineering or manufacturing
rule, and the generated PDF lists them all so the carpenter can check and override them.
All lengths are integer millimetres. See docs/carpentry.md.
"""

CARPENTRY_DEFAULTS: dict[str, int] = {
    "backThickness": 3,          # HDF back panel nailed over the full back
    "shelfSetback": 20,          # shelves stop this far behind the front edge
    "drawerFrontGap": 3,         # gap around a drawer front
    "runnerClearance": 13,       # per side, between the drawer box and the carcass (ball-bearing runners)
    "drawerBoxThickness": 15,    # drawer box sides, front and back
    "drawerBottomThickness": 3,  # HDF drawer bottom
    "drawerBoxHeightReduction": 40,  # box height = drawer height - this
    "drawerRunnerBackGap": 50,   # runner length <= depth - this
    "doorGap": 2,                # per edge, hinged doors (full overlay)
    "slidingOverlap": 30,        # overlap between neighbouring sliding panels
    "slidingHeightReduction": 50,  # space taken by the sliding track system
    "railShortening": 2,         # hanging rod = compartment width - this
    "hingeEdgeOffset": 100,      # first and last hinge from the door edge
    "shelfPinsPerShelf": 4,
    "railSupportsPerRail": 2,
    "screwsPerJoint": 3,         # confirmat 7x50 per panel joint
    "edgeBandingWastePercent": 10,
}

# Standard drawer runner lengths (mm), longest that fits is used.
RUNNER_LENGTHS: tuple[int, ...] = (250, 300, 350, 400, 450, 500, 550)

# (max door height in mm, hinges) - rule of thumb for 18 mm doors.
HINGE_TABLE: tuple[tuple[int, int], ...] = ((900, 2), (1600, 3), (2000, 4), (10_000, 5))

BACK_MATERIAL = "HDF"
