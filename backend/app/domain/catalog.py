"""Predefined material / colour / finish catalog (data kept out of rendering logic)."""

import json
from functools import lru_cache
from pathlib import Path

CATALOG_PATH = Path(__file__).with_name("catalog.json")

# Appearance field -> catalog section.
SECTIONS = {"material": "materials", "color": "colors", "finish": "finishes"}
# Door handle field -> catalog section.
HANDLE_SECTIONS = {"style": "handleStyles", "finish": "handleFinishes"}


@lru_cache
def _load_raw() -> str:
    return CATALOG_PATH.read_text(encoding="utf-8")


def load_catalog() -> dict:
    """Return a fresh copy of the catalog (callers may not share mutable state)."""
    raw = json.loads(_load_raw())
    return {section: raw[section] for section in (*SECTIONS.values(), *HANDLE_SECTIONS.values())}


def catalog_ids(catalog: dict) -> dict[str, set[str]]:
    return {field: {entry["id"] for entry in catalog[section]} for field, section in SECTIONS.items()}


def handle_ids(catalog: dict) -> dict[str, set[str]]:
    return {field: {entry["id"] for entry in catalog.get(section, [])} for field, section in HANDLE_SECTIONS.items()}
