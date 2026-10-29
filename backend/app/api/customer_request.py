"""The customer's request that travels with a design: notes for the carpenter and the room they
measured (UX/UI stage 5, ADR-008). Optional and additive: saves and exports without it behave as
before. It never contains the room photo, which stays in the browser.

Untrusted input, like everything from the client: bounded numbers, a fixed list of obstacles, capped
text with no control, zero-width or bidi-override characters (they can hide or reorder text in the
carpenter's PDF), and camelCase keys only."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

# ASSUMPTION: configurable defaults that mirror frontend/src/state/request.js.
MAX_NOTES = 1000
MAX_ROOM_TEXT = 300
ROOM_MIN_MM, ROOM_MAX_MM = 10, 20_000
Obstacle = Literal["window", "door", "socket", "beam", "radiator"]

LF = 0x0A
# [from, to] code points that are rejected: control characters except the newline, zero-width
# characters, line/paragraph separators, bidi embeddings/overrides/isolates and the BOM.
_UNSAFE_RANGES = (
    (0x00, 0x09), (0x0B, 0x1F), (0x7F, 0x9F), (0x200B, 0x200D), (0x2028, 0x2029),
    (0x202A, 0x202E), (0x2066, 0x2069), (0xFEFF, 0xFEFF),
)


def _safe_text(value: str) -> str:
    for char in value:
        code = ord(char)
        if any(low <= code <= high for low, high in _UNSAFE_RANGES):
            raise ValueError("text contains a control or hidden character")
    return value


class _Strict(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_alias=True, validate_by_name=False,
                              extra="forbid", strict=True)


RoomLength = Annotated[int, Field(ge=ROOM_MIN_MM, le=ROOM_MAX_MM)] | None


class Room(_Strict):
    width: RoomLength = None
    height: RoomLength = None
    depth: RoomLength = None
    obstacles: Annotated[list[Obstacle], Field(max_length=5)] = []
    obstacle_notes: Annotated[str, Field(max_length=MAX_ROOM_TEXT)] = ""
    style: Annotated[str, Field(max_length=MAX_ROOM_TEXT)] = ""

    @field_validator("obstacles")
    @classmethod
    def _unique(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("obstacles repeat")
        return value

    @field_validator("obstacle_notes", "style")
    @classmethod
    def _text(cls, value: str) -> str:
        return _safe_text(value)


class CustomerRequest(_Strict):
    notes: Annotated[str, Field(max_length=MAX_NOTES)] = ""
    room: Room | None = None

    @field_validator("notes")
    @classmethod
    def _text(cls, value: str) -> str:
        return _safe_text(value)

    def is_empty(self) -> bool:
        room = self.room
        return not self.notes.strip() and (room is None or (
            room.width is None and room.height is None and room.depth is None
            and not room.obstacles and not room.obstacle_notes.strip() and not room.style.strip()))

    def to_json(self) -> dict:
        """camelCase, the shape the frontend sends and receives."""
        return self.model_dump(by_alias=True)
