import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, createStore } from '../../../src/state/store.js';
import { diffDesigns } from '../../../src/state/diff.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const makeStore = () => createStore({ design: loadDesign('basic'), revision: 1, catalog });
const MOVE_SHELF = [{ op: 'modify_shelf', id: 'shf_l1', y: 450 }];
const ADD_DRAWER = [{ op: 'add_drawer', compartmentId: 'cmp_middle', y: 0, height: 200, id: 'drw_new1' }];

describe('proposals', () => {
  it('stages a proposal without touching the committed design', () => {
    const store = makeStore();
    const before = store.getState();
    expect(store.proposeChanges({ ops: ADD_DRAWER, summary: ['Add a drawer'] }).ok).toBe(true);
    const state = store.getState();
    expect(state.design).toBe(before.design);
    expect(state.revision).toBe(before.revision);
    expect(state.proposal.baseRevision).toBe(1);
    expect(state.proposal.previewDesign.compartments[1].drawers).toHaveLength(1);
    expect(state.proposal.diff.added).toEqual(['drw_new1']);
  });

  it('rejects invalid proposed ops and stores nothing', () => {
    const store = makeStore();
    const result = store.proposeChanges({ ops: [{ op: 'modify_shelf', id: 'shf_l1', y: 99999 }] });
    expect(result.ok).toBe(false);
    expect(store.getState().proposal).toBeNull();
  });

  it('applies a proposal: commits, bumps the revision, clears the proposal', () => {
    const store = makeStore();
    store.proposeChanges({ ops: ADD_DRAWER });
    expect(store.applyProposal().ok).toBe(true);
    const state = store.getState();
    expect(state.proposal).toBeNull();
    expect(state.revision).toBe(2);
    expect(state.design.compartments[1].drawers[0].id).toBe('drw_new1');
  });

  it('cancel discards the proposal and leaves the design untouched', () => {
    const store = makeStore();
    const { design } = store.getState();
    store.proposeChanges({ ops: ADD_DRAWER });
    store.cancelProposal();
    expect(store.getState().proposal).toBeNull();
    expect(store.getState().design).toBe(design);
  });

  it('a manual edit makes a pending proposal stale; applying it is rejected', () => {
    const store = makeStore();
    store.proposeChanges({ ops: ADD_DRAWER });
    store.dispatch(MOVE_SHELF);
    expect(store.getState().proposal.stale).toBe(true);
    const result = store.applyProposal();
    expect(result).toEqual({ ok: false, error: { code: 'STALE' } });
    expect(store.getState().design.compartments[1].drawers).toHaveLength(0);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes manual edits, bumping the revision each time', () => {
    const store = makeStore();
    store.dispatch(MOVE_SHELF);
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: false });
    expect(store.undo()).toBe(true);
    expect(store.getState().design.compartments[0].shelves[0].y).toBe(400);
    expect(store.getState().revision).toBe(3);
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: true });
    expect(store.redo()).toBe(true);
    expect(store.getState().design.compartments[0].shelves[0].y).toBe(450);
  });

  it('undoes an applied proposal as one step', () => {
    const store = makeStore();
    store.proposeChanges({ ops: [...ADD_DRAWER, ...MOVE_SHELF] });
    store.applyProposal();
    store.undo();
    const { design } = store.getState();
    expect(design.compartments[1].drawers).toHaveLength(0);
    expect(design.compartments[0].shelves[0].y).toBe(400);
  });

  it('never records a pending proposal; undo marks it stale', () => {
    const store = makeStore();
    store.dispatch(MOVE_SHELF);
    store.proposeChanges({ ops: ADD_DRAWER });
    store.undo();
    expect(store.getState().proposal.stale).toBe(true);
    expect(store.getState().design.compartments[1].drawers).toHaveLength(0);
  });

  it('a new edit clears the redo stack; empty stacks are no-ops', () => {
    const store = makeStore();
    expect(store.undo()).toBe(false);
    store.dispatch(MOVE_SHELF);
    store.undo();
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 500 }]);
    expect(store.redo()).toBe(false);
  });

  it('clears a selection whose component no longer exists after undo', () => {
    const store = makeStore();
    store.dispatch(ADD_DRAWER);
    store.select('drw_new1');
    store.undo();
    expect(store.getState().selection).toBeNull();
  });

  it('keeps at most HISTORY_LIMIT steps', () => {
    const store = makeStore();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 300 + (i % 2) }]);
    let steps = 0;
    while (store.undo()) steps += 1;
    expect(steps).toBe(HISTORY_LIMIT);
  });
});

describe('diffDesigns', () => {
  it('reports added, modified and removed component ids', () => {
    const store = makeStore();
    const before = store.getState().design;
    store.dispatch([...ADD_DRAWER, ...MOVE_SHELF, { op: 'remove_component', id: 'shf_r1' }]);
    const diff = diffDesigns(before, store.getState().design);
    expect(diff.added).toEqual(['drw_new1']);
    expect(diff.modified).toContain('shf_l1');
    expect(diff.removed).toEqual(['shf_r1']);
  });

  it('marks resized sections as modified', () => {
    const store = makeStore();
    const before = store.getState().design;
    store.dispatch([{ op: 'modify_compartment', compartmentId: 'cmp_left', width: 700 }]);
    const { modified } = diffDesigns(before, store.getState().design);
    expect(modified).toEqual(expect.arrayContaining(['cmp_left', 'cmp_middle']));
  });
});

describe('room style (view preference)', () => {
  it('changes wall and floor without touching the design, revision or history', () => {
    const store = makeStore();
    const { design, revision } = store.getState();
    store.setRoom({ wall: '#C6D0BD', floor: 'walnut' });
    const state = store.getState();
    expect(state.ui.room).toEqual({ wall: '#c6d0bd', floor: 'walnut' });
    expect(state.design).toBe(design);
    expect(state.revision).toBe(revision);
    expect(state.history.canUndo).toBe(false);
  });

  it('ignores invalid values', () => {
    const store = makeStore();
    store.setRoom({ wall: 'red; background:url(x)', floor: '<b>' });
    expect(store.getState().ui.room).toEqual({ wall: '#efe9e1', floor: 'oak' });
  });
});
