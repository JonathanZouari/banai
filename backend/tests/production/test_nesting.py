"""Guillotine nesting invariants (app.production.nesting) over designs of every kind."""

from collections import Counter
from itertools import combinations

import pytest

from app.production.boards import BACK_BOARD, board_for
from app.production.nesting import SHEET, SheetSpec, nest
from app.production.parts import Part, production
from tests.production.samples import CATALOG, DESIGNS

EPS = 1e-6


def nested(name: str):
    prod = production(DESIGNS[name](), CATALOG)
    return prod, nest(prod.parts)


@pytest.mark.parametrize("name", DESIGNS)
def test_parts_never_overlap_and_keep_the_kerf(name):
    _, result = nested(name)
    for sheet in result.sheets:
        for a, b in combinations(sheet.parts, 2):
            apart_x = a.x + a.w + SHEET.kerf <= b.x + EPS or b.x + b.w + SHEET.kerf <= a.x + EPS
            apart_y = a.y + a.h + SHEET.kerf <= b.y + EPS or b.y + b.h + SHEET.kerf <= a.y + EPS
            assert apart_x or apart_y, (a, b)


@pytest.mark.parametrize("name", DESIGNS)
def test_every_part_lies_inside_the_sheet_minus_the_trim(name):
    _, result = nested(name)
    for sheet in result.sheets:
        for p in sheet.parts:
            assert p.x >= SHEET.trim - EPS and p.y >= SHEET.trim - EPS
            assert p.x + p.w <= SHEET.length - SHEET.trim + EPS
            assert p.y + p.h <= SHEET.width - SHEET.trim + EPS


@pytest.mark.parametrize("name", DESIGNS)
def test_grain_parts_are_never_rotated_and_sizes_are_kept(name):
    prod, result = nested(name)
    by_no = {p.no: p for p in prod.parts}
    for sheet in result.sheets:
        for p in sheet.parts:
            part = by_no[p.no]
            assert sheet.board == part.board
            assert (p.w, p.h) == ((part.width, part.length) if p.rotated else (part.length, part.width))
            if part.grain:
                assert not p.rotated


def test_the_sliding_walnut_panels_are_grain_locked():
    prod, result = nested("sliding")
    walnut = [s for s in result.sheets if s.board.grain]
    assert walnut and all(not p.rotated for s in walnut for p in s.parts)
    assert sum(len(s.parts) for s in walnut) == sum(p.qty for p in prod.parts if p.grain)


@pytest.mark.parametrize("name", DESIGNS)
def test_every_instance_is_placed_once_or_reported_as_oversize(name):
    prod, result = nested(name)
    placed = Counter(p.no for s in result.sheets for p in s.parts)
    oversize = dict(result.oversize)
    for part in prod.parts:
        assert placed[part.no] + oversize.get(part.no, 0) == part.qty, part.name
        assert not (placed[part.no] and part.no in oversize)
    assert sum(result.by_board.values()) == len(result.sheets)
    assert 0 < result.avg_yield <= 1


def test_parts_longer_than_a_sheet_are_reported():
    prod, result = nested("tall")  # 2700 mm high: nothing full-height fits the 2420 mm a sheet leaves
    by_no = {p.no: p for p in prod.parts}
    assert {by_no[no].name for no, _ in result.oversize} == {"דופן", "מחיצה", "גב", "דלת"}
    assert all(qty == by_no[no].qty for no, qty in result.oversize)


def test_a_plain_part_rotates_when_only_the_rotation_fits():
    part = Part("גב", "גב", 1, 900, 1500, BACK_BOARD)  # 1500 across is too wide; 1500 along fits
    result = nest([part])
    assert not result.oversize
    (placement,) = result.sheets[0].parts
    assert placement.rotated and (placement.w, placement.h) == (1500, 900)


def test_a_grain_part_does_not_rotate_even_when_only_the_rotation_fits():
    walnut = board_for({"material": {"catalogId": "melamine"}, "color": {"catalogId": "walnut"},
                        "finish": {"catalogId": "matte"}}, 17, CATALOG)
    result = nest([Part("דלת", "חזיתות", 2, 900, 1500, walnut, no=1)])
    assert walnut.grain and result.oversize == [(1, 2)]
    assert not result.sheets


def test_kerf_and_trim_are_configurable():
    part = Part("מדף", "פנים", 4, 600, 600, BACK_BOARD)
    tight = nest([part], SheetSpec(length=1210, width=1210, trim=0, kerf=10))
    assert len(tight.sheets) == 1  # 600 + 10 + 600 = 1210
    loose = nest([part], SheetSpec(length=1209, width=1209, trim=0, kerf=10))
    assert len(loose.sheets) == 4
