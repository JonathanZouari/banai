"""Predefined material / colour / finish catalog (data kept out of rendering logic)."""

import json
from functools import lru_cache
from pathlib import Path

CATALOG_PATH = Path(__file__).with_name("catalog.json")

# Wood-grain texture families a color may name (optional `grain` key on color entries).
GRAINS = ("oak", "ash", "cherry", "teak", "wenge", "walnut")

# Appearance field -> catalog section.
SECTIONS = {"material": "materials", "color": "colors", "finish": "finishes"}


@lru_cache
def _load_raw() -> str:
    return CATALOG_PATH.read_text(encoding="utf-8")


def load_catalog() -> dict:
    """Return a fresh copy of the catalog (callers may not share mutable state)."""
    raw = json.loads(_load_raw())
    return {section: raw[section] for section in SECTIONS.values()}


def catalog_ids(catalog: dict) -> dict[str, set[str]]:
    return {field: {entry["id"] for entry in catalog[section]} for field, section in SECTIONS.items()}
