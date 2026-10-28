import { describe, expect, it } from 'vitest';
import { createUnsavedTracker } from '../../../src/share/unsaved.js';

function fakeStore(design) {
  let state = { design, selection: null };
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    set(patch) { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); },
  };
}

describe('unsaved tracker', () => {
  it('starts clean and ignores changes that keep the design (selection)', () => {
    const store = fakeStore({ v: 1 });
    const tracker = createUnsavedTracker(store);
    store.set({ selection: { id: 'shf_l1' } });
    expect(tracker.isDirty()).toBe(false);
  });

  it('is dirty after any new design (manual edit or applied proposal) and clean after a save', () => {
    const store = fakeStore({ v: 1 });
    const changes = [];
    const tracker = createUnsavedTracker(store, (dirty) => changes.push(dirty));
    store.set({ design: { v: 2 } });
    expect(tracker.isDirty()).toBe(true);
    tracker.markSaved(store.getState().design);
    expect(tracker.isDirty()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('keeps an edit made while a save was in flight as unsaved', () => {
    const store = fakeStore({ v: 1 });
    const tracker = createUnsavedTracker(store);
    store.set({ design: { v: 2 } });
    const saving = store.getState().design;
    store.set({ design: { v: 3 } });
    tracker.markSaved(saving);
    expect(tracker.isDirty()).toBe(true);
  });
});
