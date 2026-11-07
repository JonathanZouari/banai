"""Catalog entries reach every part of the app: the API, the agent's prompt, the domain engine and the
carpenter PDF (Hebrew names)."""

import re
from datetime import date

from fastapi.testclient import TestClient

from app.agent.prompts import build_system_prompt
from app.agent.tools import PROPOSE
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.export.pdf import render_pdf
from app.export.strings import CATALOG_NAMES
from app.main import app
from tests.agent.fakes import FakeClient, completion, propose, tool_call
from tests.agent.test_agent import chat_body, make_client  # noqa: F401 (pytest fixture)
from tests.domain.conftest import load_design
from tests.export.test_export_api import text_of

NEW_COLORS = {"olive_green": "ירוק זית", "terracotta": "טרקוטה"}
NEW_MATERIAL = ("solid_oak", "עץ אלון מלא")
OLIVE_CARCASS = {"op": "set_material", "target": "carcass", "color": {"catalogId": "olive_green"}}
# feature/catalog-colors (2026-11-07): configurable defaults, not business data.
NEXT_COLORS = {"khaki": ("#b8a77a", "חאקי", "Caqui"), "mahogany": ("#6e2f24", "מהגוני", "Caoba"),
               "dusty_rose": ("#c9a19b", "ורוד עתיק", "Rosa empolvado")}
NEXT_MATERIAL = ("hpl_laminate", "High-pressure laminate (HPL)", "למינציה בלחץ גבוה (HPL)",
                 "Laminado de alta presión (HPL)")


def test_new_colours_and_material_are_served():
    catalog = TestClient(app).get("/api/catalog").json()["data"]
    colors = {entry["id"]: entry for entry in catalog["colors"]}
    for color_id in NEW_COLORS:
        assert re.fullmatch(r"#[0-9a-f]{6}", colors[color_id]["hex"])
    assert NEW_MATERIAL[0] in {entry["id"] for entry in catalog["materials"]}


def test_every_catalog_entry_has_a_hebrew_name():
    catalog = load_catalog()
    ids = {entry["id"] for entries in catalog.values() for entry in entries}
    assert ids - CATALOG_NAMES["he"].keys() == set()


def test_agent_prompt_lists_the_hebrew_name_with_the_id():
    prompt = build_system_prompt(basic_wardrobe(), load_catalog())
    assert '"id":"olive_green","name":"Olive green","hex":"#6b6f45","nameHe":"ירוק זית"' in prompt
    assert '"id":"solid_oak","name":"Solid oak","nameHe":"עץ אלון מלא"' in prompt


def test_hebrew_olive_request_becomes_a_signed_olive_proposal(make_client):  # noqa: F811
    fake = FakeClient(completion(calls=[tool_call(PROPOSE, propose([OLIVE_CARCASS]))]))
    data = make_client(fake).post("/api/chat", json=chat_body("תצבע בירוק זית")).json()["data"]
    assert data["proposal"]["ops"] == [OLIVE_CARCASS]
    assert "ירוק זית" in fake.requests[0]["messages"][0]["content"]


def test_new_entries_apply_and_show_in_the_hebrew_pdf():
    catalog = load_catalog()
    design = apply_ops(load_design("basic"), [
        {"op": "set_material", "target": "carcass", "color": {"catalogId": "olive_green"},
         "material": {"catalogId": NEW_MATERIAL[0]}},
        {"op": "set_material", "target": "dr_right", "color": {"catalogId": "terracotta"}},
    ], catalog)
    text = text_of(render_pdf(design, catalog, "he", date(2026, 10, 23)))
    for name in [*NEW_COLORS.values(), NEW_MATERIAL[1]]:
        assert name in text, name


def test_khaki_mahogany_dusty_rose_and_hpl_are_served_with_their_hex():
    catalog = TestClient(app).get("/api/catalog").json()["data"]
    colors = {entry["id"]: entry for entry in catalog["colors"]}
    for color_id, (hex_value, *_) in NEXT_COLORS.items():
        assert colors[color_id]["hex"] == hex_value
    materials = {entry["id"]: entry for entry in catalog["materials"]}
    assert materials[NEXT_MATERIAL[0]]["name"] == NEXT_MATERIAL[1]
    hexes = [entry["hex"] for entry in catalog["colors"]]
    assert len(hexes) == len(set(hexes))  # no two swatches share a colour


def test_the_new_entries_have_hebrew_and_spanish_pdf_names():
    for color_id, (_, hebrew, spanish) in NEXT_COLORS.items():
        assert CATALOG_NAMES["he"][color_id] == hebrew
        assert CATALOG_NAMES["es"][color_id] == spanish
    assert CATALOG_NAMES["he"][NEXT_MATERIAL[0]] == NEXT_MATERIAL[2]
    assert CATALOG_NAMES["es"][NEXT_MATERIAL[0]] == NEXT_MATERIAL[3]


def test_the_new_entries_apply_and_show_in_the_pdf_in_every_language():
    catalog = load_catalog()
    design = apply_ops(load_design("basic"), [
        {"op": "set_material", "target": "carcass", "color": {"catalogId": "khaki"},
         "material": {"catalogId": NEXT_MATERIAL[0]}},
        {"op": "set_material", "target": "doors", "color": {"catalogId": "mahogany"}},
        {"op": "set_material", "target": "dr_right", "color": {"catalogId": "dusty_rose"}},
    ], catalog)
    assert design["carcass"]["appearance"]["material"] == {"catalogId": NEXT_MATERIAL[0]}
    for language, names in {
        # Text extraction returns mixed Hebrew/Latin in visual order, so "(HPL)" is checked on its own.
        "he": [hebrew for _, hebrew, _ in NEXT_COLORS.values()] + ["למינציה בלחץ גבוה", "(HPL)"],
        "en": ["Khaki", "Mahogany", "Dusty rose", NEXT_MATERIAL[1]],
        "es": [spanish for *_, spanish in NEXT_COLORS.values()] + [NEXT_MATERIAL[3]],
    }.items():
        text = " ".join(text_of(render_pdf(design, catalog, language, date(2026, 11, 7))).split())
        for name in names:
            assert name in text, (language, name)

