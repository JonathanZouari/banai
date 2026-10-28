import { describe, expect, it, vi } from 'vitest';
import { createUnsavedTracker } from '../../../src/share/unsaved.js';

// A minimal store: only the revision and subscriptions matter to the tracker.
function fakeStore(revision = 1) {
  let state = { revision };
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: (listener) => listeners.add(listener),
    set(patch) {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state));
    },
  };
}

describe('unsaved changes tracker', () => {
  it('starts clean for the design that was opened', () => {
    expect(createUnsavedTracker(fakeStore(3)).isDirty()).toBe(false);
  });

  it('turns dirty on a manual edit or a confirmed AI proposal (any revision change)', () => {
    const store = fakeStore();
    const onChange = vi.fn();
    const tracker = createUnsavedTracker(store, onChange);
    store.set({ revision: 2 }); // dispatch
    expect(tracker.isDirty()).toBe(true);
    store.set({ revision: 7 }); // replaceDesign from the server
    expect(tracker.isDirty()).toBe(true);
    expect(onChange.mock.calls).toEqual([[true]]); // notified only when the state flips
  });

  it('ignores selection and view changes', () => {
    const store = fakeStore();
    const tracker = createUnsavedTracker(store);
    store.set({ selection: { id: 'shf_l1', kind: 'shelf' }, ui: { doorsVisible: false } });
    expect(tracker.isDirty()).toBe(false);
  });

  it('is clean right after a save, and dirty again after the next change', () => {
    const store = fakeStore();
    const onChange = vi.fn();
    const tracker = createUnsavedTracker(store, onChange);
    store.set({ revision: 2 });
    tracker.markSaved(2);
    expect(tracker.isDirty()).toBe(false);
    store.set({ revision: 3 });
    expect(tracker.isDirty()).toBe(true);
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('stays dirty when the design changed while the save was in flight', () => {
    const store = fakeStore();
    const tracker = createUnsavedTracker(store);
    store.set({ revision: 2 }); // save starts at revision 2
    store.set({ revision: 3 }); // edit during the save
    tracker.markSaved(2);
    expect(tracker.isDirty()).toBe(true);
  });
});
