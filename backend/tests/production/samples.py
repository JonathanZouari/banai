"""Designs shared by the production and dossier tests, built through the op protocol."""

import struct
import zlib

from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe

CATALOG = load_catalog()


def color(catalog_id: str) -> str:
    """The catalog's own name for a color: the dossier shows what the customer picked in the app."""
    return next(c["name"] for c in CATALOG["colors"] if c["id"] == catalog_id)


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


def sliding_walnut() -> dict:
    """Three walnut sliding panels over four compartments, a drawer behind them."""
    return make(sliding(3), {"op": "set_material", "target": "doors", "color": {"catalogId": "walnut"}},
                {"op": "add_drawer", "compartmentId": "cmp_b", "y": 0, "height": 200, "id": "drw_b"},
                {"op": "add_shelf", "compartmentId": "cmp_a", "y": 1000, "id": "shf_a"}, width=2400, count=4)


def plinth_inserts() -> dict:
    """An 80 mm plinth and one of each insert."""
    return make(hinged(2),
                {"op": "add_insert", "compartmentId": "cmp_a", "type": "shoes", "id": "ins_s"},
                {"op": "add_insert", "compartmentId": "cmp_a", "type": "led", "id": "ins_l"},
                {"op": "add_rail", "compartmentId": "cmp_a", "y": 1700, "id": "rail_a"},
                {"op": "add_insert", "compartmentId": "cmp_b", "type": "trousers", "id": "ins_t"},
                {"op": "add_insert", "compartmentId": "cmp_b", "type": "pulldown", "id": "ins_p"}, plinth=80)


def split_door() -> dict:
    """One 1000 mm compartment behind a split pair of hinged leaves."""
    return make({"op": "configure_doors", "type": "hinged",
                 "doors": [{"id": "dr_a", "compartmentIds": ["cmp_a"], "hingeSide": "left"}]},
                {"op": "split_door", "id": "dr_a", "newId": "dr_a2"}, width=1000, count=1)


def rich() -> dict:
    """Sliding with a mirror, an 80 mm plinth, presets and inserts, and a site."""
    ops = [
        {"op": "apply_preset", "compartmentId": "cmp_a", "preset": "long"},
        {"op": "apply_preset", "compartmentId": "cmp_b", "preset": "double"},
        {"op": "apply_preset", "compartmentId": "cmp_c", "preset": "drawers"},
        {"op": "apply_preset", "compartmentId": "cmp_d", "preset": "long"},
        {"op": "add_insert", "compartmentId": "cmp_a", "type": "shoes", "id": "ins_shoes"},
        {"op": "add_insert", "compartmentId": "cmp_a", "type": "led", "id": "ins_led"},
        {"op": "add_insert", "compartmentId": "cmp_d", "type": "trousers", "id": "ins_tr"},
        sliding(3),
        {"op": "modify_door", "id": "dr_s2", "mirror": True},
        {"op": "set_material", "target": "doors", "color": {"catalogId": "walnut"}},
        {"op": "set_site", "ceiling": 2700, "niche": 2450},
    ]
    return make(*ops, width=2400, height=2500, depth=650, count=4, plinth=80)


def thirds() -> dict:
    """The basic wardrobe with its left compartment in three zones: shf_l2 (y 800) and shf_l4 (y 1600) become
    dividers, and dr_left becomes one door per zone."""
    return apply_ops(basic_wardrobe(), [{"op": "set_zones", "compartmentId": "cmp_left", "count": 3}], CATALOG)


def zoned() -> dict:
    """Left in thirds: a door, a pair, and an open zone with a shelf. Right in halves: a door over the drawers
    and one above it."""
    return apply_ops(basic_wardrobe(), [
        {"op": "set_zones", "compartmentId": "cmp_left", "count": 3},
        {"op": "set_zone_door", "compartmentId": "cmp_left", "zone": 2, "leaves": 2},
        {"op": "set_zone_door", "compartmentId": "cmp_left", "zone": 3, "leaves": 0},
        {"op": "apply_preset", "compartmentId": "cmp_left", "zone": 3, "preset": "shelves"},
        {"op": "set_zones", "compartmentId": "cmp_right", "count": 2},
    ], CATALOG)


def zoned_sliding() -> dict:
    """Behind sliding doors, zones are dividers only."""
    return make(sliding(2), {"op": "set_zones", "compartmentId": "cmp_a", "count": 2},
                {"op": "set_zones", "compartmentId": "cmp_b", "count": 3})


DESIGNS = {
    "basic": basic_wardrobe,
    "sliding": sliding_walnut,
    "plinth-inserts": plinth_inserts,
    "split": split_door,
    "rich": rich,
    "open": lambda: make({"op": "add_drawer", "compartmentId": "cmp_a", "y": 0, "height": 300, "id": "drw_a"}, count=3,
                         width=2600),
    "tall": lambda: make(hinged(2), height=2700, width=1300),  # sides and backs longer than a sheet
    "zones": zoned,
    "zones-sliding": zoned_sliding,
}


def png(width: int, height: int) -> bytes:
    """A valid grey PNG of this size."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\x00" + b"\x99" * width for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
