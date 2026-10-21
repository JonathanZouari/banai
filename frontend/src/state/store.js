// Single committed-state store (no framework). The design only changes through
// domain ops (applyOps); a failed op leaves the state untouched. Snapshots are
// deep-frozen, so consumers can compare by reference.

import { applyOps } from '../domain/apply.js';
import { parseCatalog } from '../domain/catalog.js';
import { DomainError } from '../domain/errors.js';
import { locate } from '../domain/lookup.js';
import { deepFreeze } from '../domain/util.js';

const KIND_BY_LOCATION = Object.freeze({
  compartment: 'compartment',
  partition: 'partition',
  door: 'door',
  shelves: 'shelf',
  drawers: 'drawer',
  rails: 'rail',
});
const INTERIOR_KINDS = new Set(['shelf', 'drawer', 'rail', 'compartment', 'partition']);

/** Resolve a component id to a selection, or null when it does not exist. */
export function resolveSelection(design, id) {
  if (id === 'carcass') return { id, kind: 'carcass' };
  const found = typeof id === 'string' ? locate(design, id) : null;
  return found ? { id, kind: KIND_BY_LOCATION[found[0]] } : null;
}

/**
 * Create the store. The initial catalog and design are validated first (applyOps with
 * no ops = parse + full validation); invalid data throws instead of being rendered.
 */
export function createStore({ design, revision = 1, catalog }) {
  const validCatalog = parseCatalog(catalog);
  const validDesign = applyOps(design, [], validCatalog);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new DomainError('SCHEMA_INVALID', 'revision', 'invalid revision');
  }
  let state = deepFreeze({
    design: validDesign, revision, catalog: validCatalog, selection: null, ui: { doorsVisible: true, selectiveOpen: false }, canUndo: false,
  });
  // Previous committed designs (newest last); undo steps back exactly one version.
  const history = [];
  const listeners = new Set();

  const commit = (patch) => {
    state = deepFreeze({ ...state, ...patch });
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Apply domain ops atomically. Returns { ok: true } or { ok: false, error: DomainError }. */
    dispatch(ops) {
      let next;
      try {
        next = applyOps(state.design, ops, state.catalog);
      } catch (error) {
        if (error instanceof DomainError) return { ok: false, error };
        throw error;
      }
      const selection = state.selection && resolveSelection(next, state.selection.id);
      history.push(state.design);
      commit({ design: next, revision: state.revision + 1, selection, canUndo: true });
      return { ok: true };
    },

    /**
     * Restore the previous design. The revision still moves forward so a pending (signed)
     * proposal made against the undone design is rejected as stale. Returns false when empty.
     */
    undo() {
      if (history.length === 0) return false;
      const previous = history.pop();
      const selection = state.selection && resolveSelection(previous, state.selection.id);
      commit({ design: previous, revision: state.revision + 1, selection, canUndo: history.length > 0 });
      return true;
    },

    select(id) {
      const selection = id === null ? null : resolveSelection(state.design, id);
      const hideDoors = selection !== null && INTERIOR_KINDS.has(selection.kind) && state.ui.doorsVisible;
      commit({ selection, ui: hideDoors ? { ...state.ui, doorsVisible: false } : state.ui });
    },

    /**
     * Commit a design produced by the server (an applied AI proposal). It is validated like the
     * initial design; invalid data throws and leaves the state untouched.
     */
    replaceDesign(design, revision) {
      const next = applyOps(design, [], state.catalog);
      if (!Number.isInteger(revision) || revision <= state.revision) {
        throw new DomainError('SCHEMA_INVALID', 'revision', 'invalid revision');
      }
      const selection = state.selection && resolveSelection(next, state.selection.id);
      history.push(state.design);
      commit({ design: next, revision, selection, canUndo: true });
    },

    setDoorsVisible(doorsVisible) {
      commit({ ui: { ...state.ui, doorsVisible } });
    },

    /** Click-to-open mode: clicking a door or drawer in the viewer animates it open or closed. */
    setSelectiveOpen(selectiveOpen) {
      commit({ ui: { ...state.ui, selectiveOpen } });
    },
  };
}
