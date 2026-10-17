"""Material-cost estimate from the cut list and the nesting (port of costEstimate in production.js).

Ranges in shekels before VAT, from the research price table (docs/research §4.2), each with its source.
Labour, delivery and installation are excluded. An item the research has no price for is listed as
unpriced, never given an invented price.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.production.boards import Board
from app.production.nesting import Nesting
from app.production.parts import Production, half_up

VAT = 0.18  # from 1.1.2025 [73]
PRICED_THICKNESS = range(16, 20)  # the table prices 17 mm boards; 16-19 mm boards use it, with a note

PRICE: dict[str, tuple[float, float, str]] = {  # key -> (low, high, source)
    "sheetWhite": (220, 250, "[59][61]"),  # white melamine 17 mm, cutting included
    "sheetColour": (240, 290, "[59][61][62]"),  # coloured melamine: +20-40 a sheet
    "sheetMdf": (178, 210, "[62][61]"),  # raw MDF 17 mm, 210 with VAT / moisture-resistant 210 before VAT
    "sheetBack": (110, 145, "[59][60][62]"),  # 5 mm back
    "edgeM": (6, 9.5, "[59][61][62]"),  # glued PVC edge for 17 mm board, per metre
    "hinge110": (24, 24, "[77]"),  # Blum CLIP top BLUMOTION 110
    "hinge155": (49, 49, "[77]"),
    "rail": (43, 51, "[79]"),  # 1 m oval rail
    "anchor": (29, 49, "[80]"),
    "slideKit": (299, 800, "[78]"),  # on sale 299-550, list price 600-800
    "pulldown": (239, 239, "[43]"),
}


@dataclass(frozen=True)
class Line:
    name: str
    qty: float
    unit: str
    lo: float
    hi: float
    src: str
    note: str = ""  # how the price applies, when it is an approximation


@dataclass
class Estimate:
    lines: list[Line]
    lo: float
    hi: float
    lo_vat: float
    hi_vat: float
    unpriced: list[str]  # names of items without a researched price


def sheet_price(board: Board) -> tuple[str | None, str]:
    """The price key of one sheet of this board, and a note when the price is an approximation."""
    if board.kind == "hdf":
        return "sheetBack", ""
    if board.thickness not in PRICED_THICKNESS:
        return None, ""
    note = "" if board.thickness == 17 else "לפי מחיר לוח 17 מ״מ"
    if board.kind == "melamine":
        return ("sheetWhite" if board.white else "sheetColour"), note
    if board.kind == "mdf":
        return "sheetMdf", note
    return None, ""


def estimate(prod: Production, nesting: Nesting) -> Estimate:
    lines: list[Line] = []
    unpriced: list[str] = []

    def priced(name: str, qty: float, unit: str, key: str, note: str = "") -> None:
        lo, hi, src = PRICE[key]
        lines.append(Line(name, qty, unit, lo * qty, hi * qty, src, note))

    for key, count in nesting.by_board.items():
        board = prod.boards[key]
        price, note = sheet_price(board)
        name = f"{board.name}, {board.thickness} מ״מ"
        if price:
            priced(name, count, "לוח", price, note)
        else:
            unpriced.append(name)
        if board.kind == "mdf":
            unpriced.append(f"צביעה בתנור: {board.name}")
    for key, metres in prod.edge_m.items():
        board = prod.boards[key]
        name = f"קנט {board.name}, {board.thickness} מ״מ"
        if board.edging == "pvc" and board.thickness in PRICED_THICKNESS:
            priced(name, metres, "מ׳", "edgeM")
        else:
            unpriced.append(name)
    for h in prod.hardware:
        if h.price:
            priced(h.name, h.qty, "יח׳", h.price)
        elif h.buy:
            unpriced.append(h.name)
    lo, hi = sum(x.lo for x in lines), sum(x.hi for x in lines)
    return Estimate(lines, lo, hi, lo * (1 + VAT), hi * (1 + VAT), unpriced)


def shekel(value: float) -> str:
    return f"₪{half_up(value):,}"
