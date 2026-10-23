"""Every customer-facing text exists in every chat language, and language detection matches the
frontend (both run shared/fixtures/language/detect.json)."""

import json
from pathlib import Path

import pytest

from app.agent.language import FALLBACK_REPLY, INSTRUCTION, LANGUAGES, OFF_TOPIC_REPLY, detect
from app.api import agent, designs, export
from app.export.strings import CATALOG_NAMES, STRINGS

FIXTURE = Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "language" / "detect.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[f"{c['current']}:{c['text']}" for c in CASES])
def test_detection_matches_the_shared_cases(case):
    assert detect(case["text"], case["current"]) == case["expected"]


@pytest.mark.parametrize("table", [OFF_TOPIC_REPLY, FALLBACK_REPLY, INSTRUCTION])
def test_fixed_agent_texts_cover_every_language(table):
    assert set(table) == set(LANGUAGES) and all(table.values())


@pytest.mark.parametrize("module", [agent, designs, export], ids=["agent", "designs", "export"])
def test_api_messages_cover_every_language(module):
    for code, texts in module.MESSAGES.items():
        assert set(texts) == set(LANGUAGES), code
        assert all(text.strip() for text in texts.values()), code


def test_pdf_strings_cover_every_language():
    keys = set(STRINGS["en"])
    for language in LANGUAGES:
        assert set(STRINGS[language]) == keys, language
        assert all(STRINGS[language].values()), language
    assert STRINGS["fr"]["dir"] == "ltr"
    assert set(CATALOG_NAMES["fr"]) == set(CATALOG_NAMES["he"])
