"""Canonical wardrobe schema (v1). Units: integer millimetres.

Structural shape only; cross-field rules live in validation.py. Mirrored by the
zod schema in frontend/src/domain/schema.js. Inputs are untrusted (they may come
from an LLM), so every int is bounded, every list is capped, keys are camelCase
only, and unknown keys are rejected.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Discriminator,
    Field,
    Tag,
    ValidationError,
    field_validator,
)
from pydantic.alias_generators import to_camel

from app.domain import ids
from app.domain.errors import SCHEMA_INVALID, DomainError

# Hard structural bounds (anti-abuse). Kept small: every op re-validates the whole
# design, so these caps bound the worst-case CPU of one request.
INT_BOUND = 1_000_000
MAX_LIST = 100  # items of one kind in one compartment
MAX_COMPARTMENTS = 20
MAX_DOORS = 20
MAX_ITEMS_TOTAL = 300  # shelves + drawers + rails across the whole design
MAX_DOOR_SHELVES_TOTAL = 100  # shelves on the inside of doors, across all doors

# Free text from customers / the LLM: no control or bidi-override characters.
SAFE_TEXT_PATTERN = r"^[^\x00-\x1f\x7f-\x9f\u200b-\u200d\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]+$"
# Unknown keys are only named in an error path when they are plain identifiers.
SAFE_KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,39}$")


def _whole_float_to_int(value: object) -> object:
    # JSON `1000.0` is indistinguishable from `1000` in JS; accept it here too (parity).
    if type(value) is float and value.is_integer():
        return int(value)
    return value


Int = Annotated[int, BeforeValidator(_whole_float_to_int), Field(ge=-INT_BOUND, le=INT_BOUND)]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_alias=True, validate_by_name=False, extra="forbid", strict=True
    )


def _typed_id(prefix: str):
    return Field(pattern=ids.id_pattern(prefix))


CompartmentId = Annotated[str, _typed_id(ids.COMPARTMENT)]
PartitionId = Annotated[str, _typed_id(ids.PARTITION)]
ShelfId = Annotated[str, _typed_id(ids.SHELF)]
DrawerId = Annotated[str, _typed_id(ids.DRAWER)]
RailId = Annotated[str, _typed_id(ids.RAIL)]
DoorId = Annotated[str, _typed_id(ids.DOOR)]
DoorShelfId = Annotated[str, _typed_id(ids.DOOR_SHELF)]
AnyId = Annotated[str, Field(pattern=ids.ANY_ID_PATTERN)]


class CatalogRef(StrictModel):
    catalog_id: str = Field(pattern=r"^[a-z0-9_]{1,40}$")


class CustomRef(StrictModel):
    custom: Literal[True]
    name: str = Field(min_length=1, max_length=80, pattern=SAFE_TEXT_PATTERN)
    hex: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("name")
    @classmethod
    def _visible_name(cls, value: str) -> str:
        # Not blank, and no Unicode tag characters (invisible text usable for prompt injection).
        if not value.strip() or any(0xE0000 <= ord(ch) <= 0xE007F for ch in value):
            raise ValueError("name must be visible text")
        return value

    @field_validator("custom", mode="before")
    @classmethod
    def _custom_must_be_true(cls, value: object) -> object:
        if value is not True:  # `1 == True` would otherwise pass Literal[True]
            raise ValueError("custom must be the boolean true")
        return value


def _ref_branch(value: object) -> str:
    # Branch by presence of `custom`, identically to the JS engine. During
    # serialization pydantic passes model instances instead of dicts.
    if isinstance(value, CustomRef) or (isinstance(value, dict) and "custom" in value):
        return "CustomRef"
    return "CatalogRef"


Ref = Annotated[
    Annotated[CatalogRef, Tag("CatalogRef")] | Annotated[CustomRef, Tag("CustomRef")],
    Discriminator(_ref_branch),
]


class Appearance(StrictModel):
    material: Ref
    color: Ref
    finish: Ref


class Dimensions(StrictModel):
    width: Int
    height: Int
    depth: Int


class Carcass(StrictModel):
    panel_thickness: Int
    appearance: Appearance


class Shelf(StrictModel):
    id: ShelfId
    y: Int
    thickness: Int
    appearance: Appearance | None = None


class Drawer(StrictModel):
    id: DrawerId
    y: Int
    height: Int
    appearance: Appearance | None = None


class Rail(StrictModel):
    id: RailId
    y: Int


class Compartment(StrictModel):
    id: CompartmentId
    width: Int
    shelves: list[Shelf] = Field(max_length=MAX_LIST)
    drawers: list[Drawer] = Field(max_length=MAX_LIST)
    rails: list[Rail] = Field(max_length=MAX_LIST)


class Partition(StrictModel):
    id: PartitionId
    thickness: Int


class DoorShelf(StrictModel):
    id: DoorShelfId
    y: Int
    depth: Int
    appearance: Appearance | None = None


class Door(StrictModel):
    id: DoorId
    compartment_ids: list[CompartmentId] = Field(max_length=MAX_LIST)
    hinge_side: Literal["left", "right"] | None = None
    appearance: Appearance | None = None
    shelves: list[DoorShelf] = Field(default_factory=list, max_length=MAX_LIST)  # absent in pre-door-shelf saves


class Doors(StrictModel):
    type: Literal["hinged", "sliding", "none"]
    appearance: Appearance
    items: list[Door] = Field(max_length=MAX_DOORS)

    @field_validator("items")
    @classmethod
    def _cap_door_shelves(cls, items: list[Door]) -> list[Door]:
        if sum(len(d.shelves) for d in items) > MAX_DOOR_SHELVES_TOTAL:
            raise ValueError("too many door shelves")
        return items


class Design(StrictModel):
    schema_version: Literal[1]
    units: Literal["mm"]
    dimensions: Dimensions
    carcass: Carcass
    compartments: list[Compartment] = Field(min_length=1, max_length=MAX_COMPARTMENTS)
    partitions: list[Partition] = Field(max_length=MAX_COMPARTMENTS)
    doors: Doors

    @field_validator("compartments")
    @classmethod
    def _cap_total_items(cls, compartments: list[Compartment]) -> list[Compartment]:
        total = sum(len(c.shelves) + len(c.drawers) + len(c.rails) for c in compartments)
        if total > MAX_ITEMS_TOTAL:
            raise ValueError("too many interior items")
        return compartments

    @field_validator("schema_version", mode="before")
    @classmethod
    def _version_not_bool(cls, value: object) -> object:
        if isinstance(value, bool):  # `True == 1` would otherwise pass Literal[1]
            raise ValueError("schemaVersion must be the integer 1")
        return value


def format_loc(loc: tuple) -> str:
    path = ""
    for part in loc:
        if isinstance(part, int):
            path += f"[{part}]"
        elif part in {"CatalogRef", "CustomRef"}:
            continue  # tagged-union branch markers added by pydantic
        else:
            path += f".{part}" if path else str(part)
    return path


def schema_error(error: ValidationError, prefix: str | None = None) -> DomainError:
    """Engine-owned message and a safe path: never echoes attacker-controlled input."""
    first = error.errors()[0]
    loc = tuple(first["loc"])
    unknown_key = first["type"] == "extra_forbidden"
    if unknown_key and not (isinstance(loc[-1], str) and SAFE_KEY_PATTERN.match(loc[-1])):
        loc = loc[:-1]  # report an unsafe unknown key at its parent
    message = "unknown field" if unknown_key else "invalid or missing value"
    return DomainError(SCHEMA_INVALID, prefix if prefix is not None else format_loc(loc), message)


def parse_design(data: object) -> dict:
    """Validate the structural shape and return the canonical JSON dict."""
    try:
        model = Design.model_validate(data)
    except ValidationError as error:
        raise schema_error(error) from None
    return model.model_dump(by_alias=True, mode="json")
