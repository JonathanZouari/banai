"""The customer's details for the carpenter's dossier (ADR-038). They live in the customer's browser with the
project, never in the design: no undo step, no signed proposal, and the agent never sees them. The dossier
request may carry them; they are used for that one PDF and are neither stored nor logged. Mirrored in
frontend/src/share/customer.js. Every field is optional.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.domain.schema import SAFE_TEXT_PATTERN


def _visible(value: str | None) -> str | None:
    """Text a person can read: safe text (also for the email and phone patterns), not blank, and no tag
    characters (invisible text a prompt could hide in)."""
    if value is not None and (not re.fullmatch(SAFE_TEXT_PATTERN, value) or not value.strip()
                              or any(0xE0000 <= ord(ch) <= 0xE007F for ch in value)):
        raise ValueError("must be visible text")
    return value


def _sensible_day(value: date | None) -> date | None:
    """An installation date between 1900 and 2100 (as the browser checks)."""
    if value is not None and not 1900 <= value.year <= 2100:
        raise ValueError("the date is out of range")
    return value


def _text(max_length: int, pattern: str = SAFE_TEXT_PATTERN):
    return Annotated[str | None, Field(default=None, min_length=1, max_length=max_length, pattern=pattern), AfterValidator(_visible)]


PHONE_PATTERN = r"^\+?[0-9][0-9 ()\-]{5,24}$"
EMAIL_PATTERN = r"^[^@\s]{1,64}@[^@\s.]{1,63}(\.[^@\s.]{1,63})+$"


class Customer(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_alias=True, validate_by_name=False, extra="forbid",
                              strict=True)

    name: _text(60) = None
    phone: _text(30, PHONE_PATTERN) = None
    email: _text(120, EMAIL_PATTERN) = None
    address: _text(120) = None  # where the wardrobe is installed: street and number
    city: _text(60) = None
    floor: Annotated[int | None, Field(default=None, ge=-5, le=150)] = None
    elevator: bool | None = None
    contact_times: _text(60) = None
    install_date: Annotated[date | None, Field(default=None, strict=False), AfterValidator(_sensible_day)] = None
    notes: _text(500) = None

    def is_empty(self) -> bool:
        return all(value is None for value in self.model_dump().values())
