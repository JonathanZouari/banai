"""Catalog additions (2026-10-23): olive green and solid oak reach the PDF and the agent."""

from __future__ import annotations

import io
import json
import re
from datetime import date

from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.agent.prompts import build_system_prompt
from app.agent.tools import PROPOSE
from app.api.agent import get_llm_client
from app.config import get_settings, get_signing_key
from app.domain.apply import apply_ops
from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.export.pdf import render_pdf
from app.export.strings import CATALOG_NAMES
from app.main import create_app
from tests.agent.fakes import FakeClient, completion, propose, tool_call

NEW_COLORS = {"olive_green": "ירוק זית"}
NEW_MATERIAL = ("solid_oak", "עץ אלון מלא")


def text_of(pdf: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)


def test_new_entries_are_in_the_catalog_with_valid_colours():
    catalog = load_catalog()
    colors = {entry["id"]: entry for entry in catalog["colors"]}
    for color_id in NEW_COLORS:
        assert re.fullmatch(r"#[0-9a-f]{6}", colors[color_id]["hex"])
    assert NEW_MATERIAL[0] in {entry["id"] for entry in catalog["materials"]}


def test_every_catalog_entry_has_a_hebrew_name():
    catalog = load_catalog()
    ids = {entry["id"] for section in ("materials", "colors", "finishes") for entry in catalog[section]}
    assert ids <= CATALOG_NAMES["he"].keys()


def test_pdf_shows_the_new_colour_and_material_in_both_languages():
    catalog = load_catalog()
    design = apply_ops(basic_wardrobe(), [{"op": "set_material", "target": "carcass",
                                           "material": {"catalogId": "solid_oak"}, "color": {"catalogId": "olive_green"}}], catalog)
    english = text_of(render_pdf(design, catalog, "en", date(2026, 10, 23)))
    assert "Olive green" in english and "Solid oak" in english
    hebrew = text_of(render_pdf(design, catalog, "he", date(2026, 10, 23)))
    assert "ירוק זית" in hebrew and "עץ אלון מלא" in hebrew


def test_the_agent_sees_the_hebrew_names_mapped_to_catalog_ids():
    prompt = build_system_prompt(basic_wardrobe(), load_catalog(), "he")
    section = prompt.split("## Hebrew catalog names", 1)[1].split("\n", 2)[1]
    names = json.loads(section)
    assert names["olive_green"] == "ירוק זית"
    assert names[NEW_MATERIAL[0]] == NEW_MATERIAL[1]


def test_paint_it_olive_green_becomes_a_valid_signed_proposal(monkeypatch):
    """"תצבע בירוק זית": the model's catalog choice passes validation and applies."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("PROPOSAL_SIGNING_KEY", "test-signing-key")
    get_settings.cache_clear()
    get_signing_key.cache_clear()
    try:
        op = {"op": "set_material", "target": "carcass", "color": {"catalogId": "olive_green"}}
        fake = FakeClient(completion(calls=[tool_call(PROPOSE, propose([op], reply="אצבע את הארון בירוק זית."))]))
        app = create_app()
        app.dependency_overrides[get_llm_client] = lambda: fake
        client = TestClient(app)
        body = {"messages": [{"role": "user", "text": "תצבע בירוק זית"}], "design": basic_wardrobe(), "revision": 1}
        proposal = client.post("/api/chat", json=body).json()["data"]["proposal"]
        assert "ירוק זית" in fake.requests[0]["messages"][0]["content"]  # the model was told the Hebrew name
        applied = client.post("/api/proposals/apply", json={"design": basic_wardrobe(), "revision": 1, "proposal": proposal}).json()
        assert applied["data"]["design"]["carcass"]["appearance"]["color"] == {"catalogId": "olive_green"}
    finally:
        get_settings.cache_clear()
        get_signing_key.cache_clear()
