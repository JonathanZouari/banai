"""Component lookup helpers shared by the op handlers (operate on draft copies)."""

from __future__ import annotations

from app.domain.errors import NOT_FOUND, DomainError
from app.domain.validation import range_issue

ITEM_KINDS = ("shelves", "drawers", "rails")


def compartment_index(design: dict, compartment_id: str, path: str) -> int:
    for index, compartment in enumerate(design["compartments"]):
        if compartment["id"] == compartment_id:
            return index
    raise DomainError(NOT_FOUND, path, "no compartment with this id")


def partition_index(design: dict, partition_id: str, path: str) -> int:
    for index, partition in enumerate(design["partitions"]):
        if partition["id"] == partition_id:
            return index
    raise DomainError(NOT_FOUND, path, "no partition with this id")


def find_item(design: dict, kind: str, item_id: str, path: str) -> dict:
    for compartment in design["compartments"]:
        for item in compartment[kind]:
            if item["id"] == item_id:
                return item
    raise DomainError(NOT_FOUND, path, f"no {kind[:-1]} with this id")


def find_door_shelf(design: dict, shelf_id: str, path: str) -> dict:
    for door in design["doors"]["items"]:
        for shelf in door["shelves"]:
            if shelf["id"] == shelf_id:
                return shelf
    raise DomainError(NOT_FOUND, path, "no door shelf with this id")


def locate(design: dict, component_id: str) -> tuple[str, int, int] | None:
    """Return (kind, compartment_or_list_index, item_index) for any component id."""
    for ci, compartment in enumerate(design["compartments"]):
        if compartment["id"] == component_id:
            return ("compartment", ci, -1)
        for kind in ITEM_KINDS:
            for ii, item in enumerate(compartment[kind]):
                if item["id"] == component_id:
                    return (kind, ci, ii)
    for pi, partition in enumerate(design["partitions"]):
        if partition["id"] == component_id:
            return ("partition", pi, -1)
    for di, door in enumerate(design["doors"]["items"]):
        if door["id"] == component_id:
            return ("door", di, -1)
        for si, shelf in enumerate(door["shelves"]):
            if shelf["id"] == component_id:
                return ("doorShelves", di, si)
    return None


def require_range(value: int, limit: str, path: str) -> None:
    issue = range_issue(value, limit, path)
    if issue:
        raise issue
