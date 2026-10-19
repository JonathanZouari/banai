"""Canonical wardrobe schema (v2; v1 input is upgraded). Units: integer millimetres.

v2 adds `site`, `carcass.plinthHeight` and `compartments[].inserts`, all with defaults,
so a v1 design parses unchanged and comes out as v2.

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
from app.domain.defaults import MAX_OBSTACLES, default_handles
from app.domain.errors import SCHEMA_INVALID, DomainError

# Hard structural bounds (anti-abuse). Kept small: every op re-validates the whole
# design, so these caps bound the worst-case CPU of one request.
INT_BOUND = 1_000_000
MAX_LIST = 100  # items of one kind in one compartment
MAX_COMPARTMENTS = 20
MAX_DOORS = 20
MAX_ITEMS_TOTAL = 300  # shelves + drawers + rails + inserts across the whole design
MAX_INSERTS = 4  # at most one insert of each type per compartment

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
InsertId = Annotated[str, _typed_id(ids.INSERT)]
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


HandleStyle = Literal["bar", "knob", "edge", "cup", "groove", "none"]
HandleFinish = Literal["steel", "black", "brass"]


class Handle(StrictModel):
    style: HandleStyle
    finish: HandleFinish


def _default_handles() -> Handle:
    return Handle.model_validate(default_handles())


class Dimensions(StrictModel):
    width: Int
    height: Int
    depth: Int


class Carcass(StrictModel):
    panel_thickness: Int
    appearance: Appearance
    plinth_height: Int = 0  # v1 designs have no plinth


class Shelf(StrictModel):
    id: ShelfId
    y: Int
    thickness: Int
    appearance: Appearance | None = None
    fixed: bool = False  # a divider that bounds zones (docs/schema.md "Zones")


class Drawer(StrictModel):
    id: DrawerId
    y: Int
    height: Int
    appearance: Appearance | None = None
    handle: Handle | None = None


class Rail(StrictModel):
    id: RailId
    y: Int


InsertType = Literal["pulldown", "shoes", "trousers", "led"]


class Insert(StrictModel):
    """An interior insert. Which of y/tiers/height apply depends on the type (checked in validation)."""

    id: InsertId
    type: InsertType
    y: Int | None = None
    tiers: Int | None = None
    height: Int | None = None


Reading3 = Annotated[list[Int | None], Field(min_length=3, max_length=3)]
ObstacleType = Literal["socket", "switch", "ac", "pipe", "window", "panel"]


class Obstacle(StrictModel):
    """Something on the wall behind the wardrobe, in mm: x from the wardrobe's left outer face (negative =
    left of it), y from the floor, and its size. Ranges are checked in validation (obstacleX/Y/Size)."""

    type: ObstacleType
    x: Int
    y: Int
    width: Int
    height: Int


class Site(StrictModel):
    """Customer's estimated site measurements (mm). The carpenter verifies them on site.

    `ceiling` and `niche` are the governing values. When the customer gave the raw readings,
    `heights` (left, middle, right) and `widths` (top, middle, bottom) keep them, any of them unknown,
    and the governing value is the smallest known reading [research 96][11]. `clearance` is the free
    floor in front of the wardrobe (docs/schema.md "Site").
    """

    ceiling: Int | None = None
    niche: Int | None = None
    heights: Reading3 | None = None
    widths: Reading3 | None = None
    clearance: Int | None = None
    obstacles: Annotated[list[Obstacle], Field(max_length=MAX_OBSTACLES)] | None = None


class Compartment(StrictModel):
    id: CompartmentId
    width: Int
    shelves: list[Shelf] = Field(max_length=MAX_LIST)
    drawers: list[Drawer] = Field(max_length=MAX_LIST)
    rails: list[Rail] = Field(max_length=MAX_LIST)
    inserts: list[Insert] = Field(default_factory=list, max_length=MAX_INSERTS)


class Partition(StrictModel):
    id: PartitionId
    thickness: Int


class Door(StrictModel):
    id: DoorId
    compartment_ids: list[CompartmentId] = Field(max_length=MAX_LIST)
    hinge_side: Literal["left", "right"] | None = None
    appearance: Appearance | None = None
    handle: Handle | None = None
    mirror: bool = False
    # A zone door is anchored to dividers (fixed shelves); null = the carcass bottom / top.
    bottom_shelf_id: ShelfId | None = None
    top_shelf_id: ShelfId | None = None


class Doors(StrictModel):
    type: Literal["hinged", "sliding", "none"]
    appearance: Appearance
    items: list[Door] = Field(max_length=MAX_DOORS)


class Design(StrictModel):
    schema_version: Literal[1, 2]
    units: Literal["mm"]
    dimensions: Dimensions
    carcass: Carcass
    compartments: list[Compartment] = Field(min_length=1, max_length=MAX_COMPARTMENTS)
    partitions: list[Partition] = Field(max_length=MAX_COMPARTMENTS)
    doors: Doors
    handles: Handle = Field(default_factory=_default_handles)
    site: Site | None = None

    @field_validator("compartments")
    @classmethod
    def _cap_total_items(cls, compartments: list[Compartment]) -> list[Compartment]:
        total = sum(len(c.shelves) + len(c.drawers) + len(c.rails) + len(c.inserts) for c in compartments)
        if total > MAX_ITEMS_TOTAL:
            raise ValueError("too many interior items")
        return compartments

    @field_validator("schema_version", mode="before")
    @classmethod
    def _version_not_bool(cls, value: object) -> object:
        if isinstance(value, bool):  # `True == 1` would otherwise pass Literal[1]
            raise ValueError("schemaVersion must be the integer 1 or 2")
        return value

    @field_validator("schema_version")
    @classmethod
    def _upgrade_version(cls, value: int) -> int:
        return 2  # a v1 design is upgraded: its v2 fields took their defaults


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
