"""Whether Playwright's Chromium is installed: the dossier PDF prints through it. Tests that print a real PDF
skip, with a reason, on a machine without it (`uv run playwright install chromium`); the Docker image has it."""

from functools import cache
from pathlib import Path

import pytest


@cache
def chromium_installed() -> bool:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            return Path(p.chromium.executable_path).exists()
    except Exception:
        return False


requires_chromium = pytest.mark.skipif(
    not chromium_installed(), reason="Playwright's Chromium is not installed (uv run playwright install chromium)"
)
