"""Spend guards are process-wide (rate limiter, hourly caps, voice budget): reset them for every test."""

import pytest

from app.api import voice
from app.api.agent import hourly_cap
from app.api.designs import create_bytes, create_cap
from app.api.limits import limiter


@pytest.fixture(autouse=True)
def _reset_spend_guards():
    limiter.reset()
    hourly_cap.reset()
    create_cap.reset()
    create_bytes.reset()
    voice.reset_guards()
    yield
    limiter.reset()
    hourly_cap.reset()
    create_cap.reset()
    create_bytes.reset()
    voice.reset_guards()
