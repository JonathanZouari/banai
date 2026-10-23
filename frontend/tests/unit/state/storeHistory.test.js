import { describe, expect, it, vi } from 'vitest';
import { COALESCE_MS, HISTORY_LIMIT, createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();

function makeStore() {
  let t = 0;
  const clock = { advance: (ms) => { t += ms; } };
  const store = createStore({ design: loadDesign('basic'), revision: 1, catalog, now: () => t });
  return { store, clock };
}
const shelfY = (store) => store.getState().design.compartments[0].shelves[0].y;
const moveShelf = (store, y, coalesce) => store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y }], { coalesce });

describe('store history (ADR-023)', () => {
  it('undoes and redoes design changes, bumping the revision each time', () => {
    const { store } = makeStore();
    const original = shelfY(store);
    moveShelf(store, 450);
    expect(store.getState().history).toEqual({ undo: 1, redo: 0 });
    expect(store.undo()).toBe(true);
    expect(shelfY(store)).toBe(original);
    expect(store.getState().revision).toBe(3);
    expect(store.getState().history).toEqual({ undo: 0, redo: 1 });
    expect(store.redo()).toBe(true);
    expect(shelfY(store)).toBe(450);
    expect(store.getState().revision).toBe(4);
  });

  it('returns false and changes nothing with an empty history', () => {
    const { store } = makeStore();
    const before = store.getState();
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(false);
    expect(store.getState()).toBe(before);
  });

  it('collapses rapid edits of one control into one step', () => {
    const { store, clock } = makeStore();
    const original = shelfY(store);
    for (const y of [400, 420, 440, 460]) {
      moveShelf(store, y, 'slider:shelf.y');
      clock.advance(COALESCE_MS / 4);
    }
    expect(store.getState().history.undo).toBe(1);
    store.undo();
    expect(shelfY(store)).toBe(original);
  });

  it('starts a new step after a pause, for another control, or without a key', () => {
    const { store, clock } = makeStore();
    moveShelf(store, 400, 'a');
    clock.advance(COALESCE_MS + 1);
    moveShelf(store, 420, 'a');
    moveShelf(store, 440, 'b');
    moveShelf(store, 460);
    moveShelf(store, 480);
    expect(store.getState().history.undo).toBe(5);
  });

  it('a step after undo never merges into the step before it', () => {
    const { store } = makeStore();
    moveShelf(store, 400, 'a');
    store.undo();
    moveShelf(store, 420, 'a');
    expect(store.getState().history).toEqual({ undo: 1, redo: 0 });
  });

  it('a new edit clears the redo stack', () => {
    const { store } = makeStore();
    moveShelf(store, 400);
    store.undo();
    moveShelf(store, 420);
    expect(store.redo()).toBe(false);
  });

  it('a failed op leaves the history untouched', () => {
    const { store } = makeStore();
    moveShelf(store, 400);
    moveShelf(store, 99999);
    expect(store.getState().history).toEqual({ undo: 1, redo: 0 });
  });

  it('keeps at most HISTORY_LIMIT steps', () => {
    const { store } = makeStore();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) moveShelf(store, 300 + (i % 2) * 10);
    expect(store.getState().history.undo).toBe(HISTORY_LIMIT);
  });

  it('drops a selection that no longer exists after undo', () => {
    const { store } = makeStore();
    store.dispatch([{ op: 'add_shelf', compartmentId: 'cmp_middle', y: 300, id: 'shf_new' }]);
    store.select('shf_new');
    store.undo();
    expect(store.getState().selection).toBeNull();
    store.redo();
    expect(store.getState().selection).toBeNull();
  });
});

describe('store saved version (hold to compare)', () => {
  it('shows the saved version only while comparing', () => {
    const { store } = makeStore();
    store.setComparing(true);
    expect(store.getState().ui.comparing).toBe(false); // nothing saved yet
    store.saveVersion();
    const saved = store.getState().design;
    moveShelf(store, 450);
    store.setComparing(true);
    expect(store.getState().ui.comparing).toBe(true);
    expect(store.getState().version).toBe(saved);
    store.setComparing(false);
    expect(store.getState().ui.comparing).toBe(false);
  });

  it('clearing the version ends comparing, and the design is never touched', () => {
    const { store } = makeStore();
    store.saveVersion();
    moveShelf(store, 450);
    const design = store.getState().design;
    store.setComparing(true);
    store.clearVersion();
    expect(store.getState().version).toBeNull();
    expect(store.getState().ui.comparing).toBe(false);
    expect(store.getState().design).toBe(design);
  });

  it('does not notify when comparing does not change', () => {
    const { store } = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setComparing(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('store inserts', () => {
  it('resolves insert ids to the insert kind and hides the doors to show them', () => {
    const { store } = makeStore();
    store.dispatch([{ op: 'add_insert', compartmentId: 'cmp_middle', type: 'led', id: 'ins_led' }]);
    store.select('ins_led');
    expect(store.getState().selection).toEqual({ id: 'ins_led', kind: 'insert' });
    expect(store.getState().ui.doorsVisible).toBe(false);
  });
});
