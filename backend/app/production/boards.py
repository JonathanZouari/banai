"""Boards: what the carpenter orders for each part (the P2 prototype's "decor").

A design board is the resolved appearance of a part (catalog or custom material, color and finish)
plus its thickness. Names come from the catalog, the same ones the customer picked in the app. Wood
grain comes from the catalog color (`grain`) and locks the part's rotation in nesting. Drawer boxes
and backs are fixed boards that are not part of the design, as in P2.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, replace

from app.i18n import tr

# Catalog material -> (kind, edging). Production knowledge, not labels: what the board is priced as,
# and how its edges are finished (None: painted, no banding).
MATERIALS = {
    "melamine": ("melamine", "pvc"),
    "oak_veneer": ("veneer", "veneer"),
    "lacquered_mdf": ("mdf", None),
}
DEFAULT_TINT = "#d9d9d9"


@dataclass(frozen=True)
class Board:
    key: str  # identity: the three refs and the thickness
    name: str
    material: str
    color: str
    finish: str
    thickness: int
    tint: str  # hex for drawings
    grain: bool  # wood grain: the length runs along the sheet, no rotation
    kind: str  # melamine | veneer | mdf | custom | hdf
    edging: str | None  # pvc | veneer | other | None (painted edges)
    white: bool = False  # plain white melamine, priced as such
    fixed: bool = False  # not a design board (drawer boxes, backs)


DRAWER_BOARD = Board("fixed:drawer16", "לוח מלמין · לבן · מט", "לוח מלמין", "לבן", "מט", 16, "#f0efeb", False, "melamine",
                     "pvc", white=True, fixed=True)
BACK_BOARD = Board("fixed:hdf5", "HDF · לבן", "HDF", "לבן", "—", 5, "#f4f3ef", False, "hdf", None, fixed=True)


def _entry(catalog: dict, section: str, ref: dict) -> dict:
    return next((e for e in catalog[section] if e["id"] == ref.get("catalogId")), {})


def _label(ref: dict, entry: dict) -> str:
    """A custom name as the customer typed it; a catalog name in the dossier's language."""
    return ref["name"] if ref.get("custom") else tr(entry.get("name") or ref["catalogId"])


def localized(board: Board) -> Board:
    """A fixed board (drawer box, back) with its labels in the current language; the key is unchanged."""
    labels = (tr(board.material), tr(board.color), board.finish if board.finish == "—" else tr(board.finish))
    return replace(board, name=" · ".join(x for x in labels if x != "—"), material=labels[0], color=labels[1], finish=labels[2])


def board_for(appearance: dict, thickness: int, catalog: dict) -> Board:
    """The board of a part with this resolved appearance and thickness."""
    material, color, finish = appearance["material"], appearance["color"], appearance["finish"]
    color_entry = _entry(catalog, "colors", color)
    kind, edging = ("custom", "other") if material.get("custom") else MATERIALS.get(material["catalogId"], ("custom", "other"))
    labels = (_label(material, _entry(catalog, "materials", material)), _label(color, color_entry),
              _label(finish, _entry(catalog, "finishes", finish)))
    tint = (color.get("hex") if color.get("custom") else color_entry.get("hex")) or DEFAULT_TINT
    key = json.dumps([[material, color, finish], thickness], sort_keys=True, ensure_ascii=False)
    return Board(key, " · ".join(labels), *labels, thickness, tint, bool(color_entry.get("grain")), kind, edging,
                 white=kind == "melamine" and color.get("catalogId") == "white")


def resolve(override: dict | None, inherited: dict) -> dict:
    """An item's appearance: its own override, or the one it inherits."""
    return override or inherited


def handle_of(item: dict, design: dict) -> dict:
    """An item's handle: its own override, or the design-wide default."""
    return item.get("handle") or design["handles"]
