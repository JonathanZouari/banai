"""Catalog integrity: the catalog is the single source for the editor, 3D view, PDF and agent."""

import re

from app.domain.catalog import load_catalog
from app.export.strings import CATALOG_NAMES

NEW_COLORS = {"olive_green": "#6b7a47", "dusty_blue": "#6f8aa3"}
NEW_MATERIALS = {"solid_wood"}

# Entries that existed before the colours feature must keep their id and value.
EXISTING_COLORS = {
    "white": "#f2f1ed", "light_grey": "#c9c8c4", "anthracite": "#3b3d40",
    "black": "#1d1d1f", "natural_oak": "#c49a6c", "walnut": "#6b4a32",
}
EXISTING_MATERIALS = {"melamine", "oak_veneer", "lacquered_mdf"}
EXISTING_FINISHES = {"matte", "satin", "gloss"}


def test_ids_are_unique_and_well_formed_in_every_section():
    for section, entries in load_catalog().items():
        ids = [entry["id"] for entry in entries]
        assert len(ids) == len(set(ids)), section
        assert all(re.fullmatch(r"[a-z0-9_]{1,40}", i) for i in ids), section


def test_every_colour_has_a_valid_hex():
    for color in load_catalog()["colors"]:
        assert re.fullmatch(r"#[0-9a-fA-F]{6}", color["hex"]), color["id"]


def test_new_colours_and_material_are_in_the_catalog():
    catalog = load_catalog()
    colors = {c["id"]: c["hex"] for c in catalog["colors"]}
    assert {i: colors.get(i) for i in NEW_COLORS} == NEW_COLORS
    assert NEW_MATERIALS <= {m["id"] for m in catalog["materials"]}


def test_existing_entries_are_unchanged():
    catalog = load_catalog()
    colors = {c["id"]: c["hex"] for c in catalog["colors"]}
    assert {i: colors[i] for i in EXISTING_COLORS} == EXISTING_COLORS
    assert EXISTING_MATERIALS <= {m["id"] for m in catalog["materials"]}
    assert {f["id"] for f in catalog["finishes"]} == EXISTING_FINISHES


def test_every_catalog_id_has_a_hebrew_name_for_the_pdf():
    # Guard for future entries: a missing name would silently print the English one in Hebrew.
    missing = [
        entry["id"] for entries in load_catalog().values() for entry in entries
        if entry["id"] not in CATALOG_NAMES["he"]
    ]
    assert missing == []


def test_hebrew_names_are_distinct():
    names = list(CATALOG_NAMES["he"].values())
    assert len(names) == len(set(names))
