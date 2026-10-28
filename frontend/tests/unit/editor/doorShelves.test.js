import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { DomainError } from '../../../src/domain/errors.js';
import { elevationModel } from '../../../src/editor/doorElevation.js';
import {
  DOOR_SHELF_LAYOUTS, addDoorShelfOps, doorHingeOps, doorShelfLayoutOps, friendlyError, nextDoorShelfGap,
} from '../../../src/editor/opsFromForm.js';
import { createStore } from '../../../src/state/store.js';
import { doorShelfSetbacks } from '../../../src/viewer/doorShelfSetback.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // interior height 2364, doors dr_left / dr_middle / dr_right
const withShelf = applyOps(basic, [{ op: 'add_door_shelf', doorId: 'dr_left', y: 1000, depth: 120, id: 'dsh_1' }], catalog);
const door = (design, id) => design.doors.items.find((d) => d.id === id);

describe('+ Door shelf', () => {
  it('goes in the middle of the largest free gap, with a fresh dsh_ id', () => {
    const [op] = addDoorShelfOps(basic, 'dr_left');
    expect(op).toMatchObject({ op: 'add_door_shelf', doorId: 'dr_left', y: Math.floor((2364 - 12) / 2) });
    expect(op.id).toMatch(/^dsh_[0-9a-f]{8}$/);
    expect(() => applyOps(basic, [op], catalog)).not.toThrow();
  });

  it('avoids the shelves already on the door', () => {
    expect(nextDoorShelfGap(withShelf, door(withShelf, 'dr_left'))).toEqual([1012, 2364]);
    const [op] = addDoorShelfOps(withShelf, 'dr_left');
    expect(() => applyOps(withShelf, [op], catalog)).not.toThrow();
  });
});

describe('quick layouts', () => {
  it.each(DOOR_SHELF_LAYOUTS.map((l) => [l.key, l]))('%s adds its shelves in one valid batch', (key, layout) => {
    const ops = doorShelfLayoutOps(basic, 'dr_middle', key);
    expect(ops).toHaveLength(layout.at.length);
    expect(ops.every((op) => op.depth === layout.depth)).toBe(true);
    const result = applyOps(basic, ops, catalog);
    expect(door(result, 'dr_middle').shelves).toHaveLength(layout.at.length);
  });

  it('is offered as null (disabled) when it would hit an existing door shelf', () => {
    const even = applyOps(basic, doorShelfLayoutOps(basic, 'dr_left', 'even3'), catalog);
    expect(doorShelfLayoutOps(even, 'dr_left', 'even3')).toBeNull();
    expect(doorShelfLayoutOps(even, 'dr_middle', 'even3')).not.toBeNull();
  });
});

describe('door shelves through other edits', () => {
  it('survive a hinge-side change from the editor', () => {
    const flipped = applyOps(withShelf, doorHingeOps(withShelf, 'dr_left', 'right'), catalog);
    expect(door(flipped, 'dr_left')).toMatchObject({ hingeSide: 'right', shelves: [{ id: 'dsh_1', y: 1000 }] });
  });
});

describe('friendlyError for door shelves', () => {
  it('names door shelves when the engine path points at one', () => {
    expect(friendlyError(new DomainError('OVERLAP', 'doors.items[0].shelves[1]', 'x'))).toMatch(/Door shelves can't overlap/);
    expect(friendlyError(new DomainError('OUT_OF_RANGE', 'doors.items[0].shelves[0].depth', 'x'))).toBe('Door shelf depth must be 6–15 cm.');
    expect(friendlyError(new DomainError('INVALID_OP', 'ops[0].doorId', 'x'))).toBe('Door shelves need hinged doors.');
    expect(friendlyError(new DomainError('OVERLAP', 'compartments[0].shelves[1]', 'x'))).toMatch(/shelf or drawer/);
  });
});

describe('door elevation model', () => {
  it('draws the door to scale with its shelves bottom to top and the next gap', () => {
    const two = applyOps(withShelf, [{ op: 'add_door_shelf', doorId: 'dr_left', y: 300, id: 'dsh_0' }], catalog);
    const model = elevationModel(two, door(two, 'dr_left'));
    expect(model.height).toBe(160);
    expect(model.width).toBe(Math.round(643 * (160 / 2364)));
    expect(model.shelves.map((s) => [s.id, s.number])).toEqual([['dsh_0', 1], ['dsh_1', 2]]);
    expect(model.shelves[0].top).toBeGreaterThan(model.shelves[1].top); // lower shelf, larger svg y
    expect(model.next.top).toBeCloseTo(0, 6); // the largest gap runs up to the top of the door
  });
});

describe('setback and store', () => {
  it('sets back only the compartments behind a door with shelves', () => {
    expect(doorShelfSetbacks(withShelf)).toEqual([122, 0, 0]);
    expect(doorShelfSetbacks(basic)).toEqual([0, 0, 0]);
  });

  it('selecting a door shelf resolves its kind and opens the doors', () => {
    const store = createStore({ design: withShelf, catalog });
    store.select('dsh_1');
    expect(store.getState().selection).toEqual({ id: 'dsh_1', kind: 'doorShelf' });
    expect(store.getState().ui.doorsVisible).toBe(false);
  });
});
