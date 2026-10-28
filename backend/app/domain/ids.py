"""Stable, typed component identifiers (`<prefix>_<suffix>`). Mirrors frontend/src/domain/ids.js."""

import secrets

COMPARTMENT = "cmp"
PARTITION = "prt"
SHELF = "shf"
DRAWER = "drw"
RAIL = "rail"
DOOR = "dr"
DOOR_SHELF = "dsh"

_SUFFIX = r"[A-Za-z0-9_-]{1,40}"
ANY_ID_PATTERN = rf"^(cmp|prt|shf|drw|rail|dr|dsh)_{_SUFFIX}$"


def id_pattern(prefix: str) -> str:
    return rf"^{prefix}_{_SUFFIX}$"


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"
