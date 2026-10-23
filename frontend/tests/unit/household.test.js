import { describe, expect, it } from 'vitest';
import {
  CHILD_HEIGHT, MAX_PEOPLE, STORAGE_KEY, childSafety, loadHousehold, normalizePeople, releaseHeightFor, saveHousehold,
} from '../../src/household/household.js';
import { createStore } from '../../src/state/store.js';
import { loadCatalog, loadDesign } from './domain/helpers.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

describe('household', () => {
  it('keeps only well-formed people, at most MAX_PEOPLE', () => {
    const people = normalizePeople([
      { id: 'p_a', name: '  Noa  ', height: 1000 },
      { height: 90 }, // out of range
      { height: 1700.5 }, // not an integer
      'junk',
      ...Array.from({ length: 10 }, () => ({ height: 1700 })),
    ]);
    expect(people).toHaveLength(MAX_PEOPLE);
    expect(people[0]).toEqual({ id: 'p_a', name: 'Noa', height: 1000 });
    expect(normalizePeople('nope')).toEqual([]);
  });

  it('saves to and loads from storage, and survives damaged or blocked storage', () => {
    const storage = memoryStorage();
    saveHousehold([{ id: 'p_a', name: '', height: 1200 }], storage);
    expect(loadHousehold(storage)).toEqual([{ id: 'p_a', name: '', height: 1200 }]);
    storage.setItem(STORAGE_KEY, '{broken');
    expect(loadHousehold(storage)).toEqual([]);
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadHousehold(blocked)).toEqual([]);
    expect(() => saveHousehold([], blocked)).not.toThrow();
  });

  it('puts the release button above a standing child reach (1.3 x height, 5 cm steps, at least 120 cm)', () => {
    expect(releaseHeightFor(1000)).toBe(1300);
    expect(releaseHeightFor(1290)).toBe(1700); // 1677 -> 1700
    expect(releaseHeightFor(600)).toBe(1200);
  });

  it('warns only when a child lives here, counting low drawers as steps', () => {
    const design = loadDesign('basic');
    expect(childSafety(design, [{ id: 'p_a', name: '', height: 1750 }])).toBeNull();
    const safety = childSafety(design, [{ id: 'p_a', name: '', height: 1750 }, { id: 'p_b', name: '', height: 950 }]);
    const lowDrawers = design.compartments.flatMap((c) => c.drawers).filter((d) => d.y < 950).length;
    expect(safety).toMatchObject({ count: 1, tallest: 950, steps: lowDrawers, releaseHeight: 1250, releaseOnWall: false });
    expect(childSafety(design, [{ id: 'p_c', name: '', height: CHILD_HEIGHT }])).toBeNull(); // 140 cm is not a child
  });

  it('a release above the wardrobe goes on the wall beside it', () => {
    const design = { ...loadDesign('basic'), dimensions: { width: 1000, height: 1500, depth: 500 } };
    expect(childSafety(design, [{ id: 'p_a', name: '', height: 1300 }]).releaseOnWall).toBe(true);
  });

  it('lives in the store outside the design and its revision', () => {
    const store = createStore({ design: loadDesign('basic'), revision: 1, catalog: loadCatalog(), household: [{ height: 1000 }] });
    const { design, revision } = store.getState();
    store.setHousehold([...store.getState().household, { height: 1800 }]);
    expect(store.getState().household.map((p) => p.height)).toEqual([1000, 1800]);
    expect(store.getState().design).toBe(design);
    expect(store.getState().revision).toBe(revision);
  });
});
