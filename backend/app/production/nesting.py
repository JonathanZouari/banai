"""Guillotine sheet nesting (port of nesting.js in the P2 prototype): every cut runs edge to edge, as on
a panel saw. Best-short-side fit, shorter-leftover-axis split, a kerf between parts and a trim at the
sheet edges. Wood-grain parts keep their length along the sheet length; plain boards may rotate.
Pure: parts in, sheets out. A part larger than the usable sheet is reported, never dropped.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.production.boards import Board
    from app.production.parts import Part

EPS = 1e-6
MIN_OFFCUT = 30  # free rectangles this narrow are waste


@dataclass(frozen=True)
class SheetSpec:
    length: int = 2440  # board 244x122 [59]-[62]
    width: int = 1220
    trim: int = 10
    kerf: float = 3.2  # [108]


SHEET = SheetSpec()


@dataclass(frozen=True)
class Placement:
    no: int
    x: float
    y: float
    w: float
    h: float
    rotated: bool


@dataclass
class Sheet:
    board: Board
    parts: list[Placement] = field(default_factory=list)
    used: float = 0.0  # fraction of the sheet area

    @property
    def thickness(self) -> int:
        return self.board.thickness


@dataclass
class Nesting:
    sheets: list[Sheet]
    by_board: dict[str, int]  # board key -> sheet count, in first-use order
    oversize: list[tuple[int, int]]  # (part no, instances) that fit no sheet
    avg_yield: float


@dataclass
class _Free:
    x: float
    y: float
    w: float
    h: float


@dataclass
class _Item:
    no: int
    length: int
    width: int
    rotatable: bool

    def orientations(self) -> list[tuple[int, int, bool]]:
        out = [(self.length, self.width, False)]
        if self.rotatable and self.length != self.width:
            out.append((self.width, self.length, True))
        return out


def nest(parts: list[Part], sheet: SheetSpec = SHEET) -> Nesting:
    ux, uy = sheet.length - 2 * sheet.trim, sheet.width - 2 * sheet.trim
    groups: dict[str, tuple[Board, list[_Item]]] = {}
    oversize = []
    for part in parts:
        items = groups.setdefault(part.board.key, (part.board, []))[1]
        fits = (part.length <= ux and part.width <= uy) or (not part.grain and part.width <= ux and part.length <= uy)
        if not fits:
            oversize.append((part.no, part.qty))
            continue
        items.extend(_Item(part.no, part.length, part.width, not part.grain) for _ in range(part.qty))

    sheets: list[Sheet] = []
    for board, items in groups.values():
        items.sort(key=lambda it: (-max(it.length, it.width), -it.length * it.width))
        mine: list[tuple[Sheet, list[_Free]]] = []
        for item in items:
            best = None
            for s, free in mine:
                for fi, f in enumerate(free):
                    for w, h, rotated in item.orientations():
                        if w > f.w + EPS or h > f.h + EPS:
                            continue
                        score = min(f.w - w, f.h - h)
                        if best is None or score < best[0]:
                            best = (score, s, free, fi, w, h, rotated)
            if best is None:
                s, free = Sheet(board), [_Free(sheet.trim, sheet.trim, ux, uy)]
                mine.append((s, free))
                w, h, rotated = next(o for o in item.orientations() if o[0] <= ux and o[1] <= uy)
                best = (0, s, free, 0, w, h, rotated)
            _place(best[1:], item, sheet.kerf)
        for s, _ in mine:
            s.used = sum(p.w * p.h for p in s.parts) / (sheet.length * sheet.width)
            sheets.append(s)
    by_board: dict[str, int] = {}
    for s in sheets:
        by_board[s.board.key] = by_board.get(s.board.key, 0) + 1
    avg = sum(s.used for s in sheets) / len(sheets) if sheets else 0.0
    return Nesting(sheets, by_board, oversize, avg)


def _place(best: tuple, item: _Item, kerf: float) -> None:
    s, free, fi, w, h, rotated = best
    f = free.pop(fi)
    s.parts.append(Placement(item.no, f.x, f.y, w, h, rotated))
    # Shorter-leftover-axis split keeps the larger leftover in one piece.
    horizontal = f.w - w < f.h - h
    right = _Free(f.x + w + kerf, f.y, f.w - w - kerf, h if horizontal else f.h)
    top = _Free(f.x, f.y + h + kerf, f.w if horizontal else w, f.h - h - kerf)
    free.extend(r for r in (right, top) if r.w > MIN_OFFCUT and r.h > MIN_OFFCUT)
