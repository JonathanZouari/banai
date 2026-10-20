import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const makeStore = () => createStore({ design: loadDesign('basic'), revision: 1, catalog });

describe('store', () => {
  it('exposes an immutable initial snapshot', () => {
    const state = makeStore().getState();
    expect(state.revision).toBe(1);
    expect(state.selection).toBeNull();
    expect(state.ui.doorsVisible).toBe(true);
    expect(Object.isFrozen(state.design.compartments[0])).toBe(true);
  });

  it('applies ops, bumps the revision and notifies subscribers', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const result = store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    expect(result.ok).toBe(true);
    expect(store.getState().revision).toBe(2);
    expect(store.getState().design.compartments[0].shelves[0].y).toBe(450);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('leaves state untouched and does not notify on a domain error', () => {
    const store = makeStore();
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    const result = store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 99999 }]);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('OUT_OF_BOUNDS');
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('selects components by id and resolves their kind', () => {
    const store = makeStore();
    store.select('shf_l2');
    expect(store.getState().selection).toEqual({ id: 'shf_l2', kind: 'shelf' });
    store.select('carcass');
    expect(store.getState().selection).toEqual({ id: 'carcass', kind: 'carcass' });
    store.select(null);
    expect(store.getState().selection).toBeNull();
    store.select('shf_unknown');
    expect(store.getState().selection).toBeNull();
  });

  it('hides doors when an interior component is selected', () => {
    const store = makeStore();
    store.select('dr_left');
    expect(store.getState().ui.doorsVisible).toBe(true);
    store.select('drw_r1');
    expect(store.getState().ui.doorsVisible).toBe(false);
  });

  it('clears the selection when the selected component is removed', () => {
    const store = makeStore();
    store.select('shf_l1');
    store.dispatch([{ op: 'remove_component', id: 'shf_l1' }]);
    expect(store.getState().selection).toBeNull();
  });

  it('toggles door visibility and unsubscribes listeners', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setDoorsVisible(false);
    expect(store.getState().ui.doorsVisible).toBe(false);
    unsubscribe();
    store.setDoorsVisible(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('store input validation (Phase 3 security review M1)', () => {
  it('rejects an invalid initial design before anything renders', () => {
    const bad = structuredClone(loadDesign('basic'));
    bad.dimensions.width = -5000;
    expect(() => createStore({ design: bad, revision: 1, catalog })).toThrow();
    expect(() => createStore({ design: {}, revision: 1, catalog })).toThrow();
  });

  it('rejects a malformed or hostile catalog', () => {
    const missing = { materials: [], finishes: [] };
    expect(() => createStore({ design: loadDesign('basic'), revision: 1, catalog: missing })).toThrow();
    const hostile = structuredClone(catalog);
    hostile.colors[0].hex = 'red;background:url(https://evil/x)';
    expect(() => createStore({ design: loadDesign('basic'), revision: 1, catalog: hostile })).toThrow();
  });

  it('rejects an invalid revision', () => {
    expect(() => createStore({ design: loadDesign('basic'), revision: 0, catalog })).toThrow();
  });
});

describe('store undo', () => {
  it('restores the previous design, moves the revision forward and can undo repeatedly', () => {
    const store = makeStore();
    const original = store.getState().design;
    expect(store.canUndo()).toBe(false);
    expect(store.undo()).toEqual({ ok: false });
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 500 }]);
    expect(store.canUndo()).toBe(true);
    expect(store.undo()).toEqual({ ok: true });
    expect(store.getState().design.compartments[0].shelves[0].y).toBe(450);
    expect(store.getState().revision).toBe(4);
    store.undo();
    expect(store.getState().design).toEqual(original);
    expect(store.canUndo()).toBe(false);
  });

  it('does not record failed ops, and undoes a design replaced by the server', () => {
    const store = makeStore();
    store.dispatch([{ op: 'modify_shelf', id: 'nope', y: 1 }]);
    expect(store.canUndo()).toBe(false);
    const before = store.getState().design;
    store.replace(store.getState().design, 7);
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.getState().design).toEqual(before);
    expect(store.getState().revision).toBe(8);
  });

  it('notifies subscribers and keeps at most 50 steps', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    store.subscribe(listener);
    store.undo();
    expect(listener).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 60; i += 1) store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 400 + i }]);
    let undone = 0;
    while (store.undo().ok) undone += 1;
    expect(undone).toBe(50);
  });

  it('redo re-applies undone changes in order, and a new change clears the redo list', () => {
    const store = makeStore();
    const y = () => store.getState().design.compartments[0].shelves[0].y;
    const start = y();
    expect(store.canRedo()).toBe(false);
    expect(store.redo().ok).toBe(false);
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 460 }]);
    store.undo();
    store.undo();
    expect(y()).toBe(start);
    expect(store.canRedo()).toBe(true);
    const revision = store.getState().revision;
    expect(store.redo().ok).toBe(true);
    expect(y()).toBe(450);
    expect(store.getState().revision).toBe(revision + 1);
    expect(store.canUndo()).toBe(true);
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 470 }]);
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(y()).toBe(450);
    store.replace(store.getState().design, 99); // an applied proposal is a new change too
    expect(store.canRedo()).toBe(false);
  });
});
