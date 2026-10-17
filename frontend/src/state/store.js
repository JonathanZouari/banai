// Single committed-state store (no framework). The design only changes through
// domain ops (applyOps); a failed op leaves the state untouched. Snapshots are
// deep-frozen, so consumers can compare by reference.
//
// History (ADR-023): every committed design change keeps the previous design for undo.
// Edits that pass the same `coalesce` key within COALESCE_MS (one slider drag, arrow-key
// repeats) collapse into a single step, so undo goes back a whole gesture. Undo and redo
// are design changes too: they bump the revision, so a pending AI proposal turns stale.
// A saved version can be shown in place of the design while `ui.comparing` is on.

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
  inserts: 'insert',
});
const INTERIOR_KINDS = new Set(['shelf', 'drawer', 'rail', 'insert', 'compartment', 'partition']);
export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 700;

/** Resolve a component id to a selection, or null when it does not exist. */
export function resolveSelection(design, id) {
  if (id === 'carcass') return { id, kind: 'carcass' };
  const found = typeof id === 'string' ? locate(design, id) : null;
  return found ? { id, kind: KIND_BY_LOCATION[found[0]] } : null;
}

/**
 * Create the store. The initial catalog and design are validated first (applyOps with
 * no ops = parse + full validation); invalid data throws instead of being rendered.
 * `now` is injectable so tests control the coalescing clock.
 */
export function createStore({ design, revision = 1, catalog, now = () => Date.now() }) {
  const validCatalog = parseCatalog(catalog);
  const validDesign = applyOps(design, [], validCatalog);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new DomainError('SCHEMA_INVALID', 'revision', 'invalid revision');
  }
  const past = [];
  const future = [];
  let last = { key: null, at: -Infinity };
  const historyInfo = () => ({ undo: past.length, redo: future.length });

  let state = deepFreeze({
    design: validDesign, revision, catalog: validCatalog, selection: null,
    history: historyInfo(), version: null,
    ui: { doorsVisible: true, doorsOpen: false, showClothes: true, comparing: false },
  });
  const listeners = new Set();

  const commit = (patch) => {
    state = deepFreeze({ ...state, ...patch });
    listeners.forEach((listener) => listener(state));
  };

  /** Commit a new design; the selection survives when its component still exists. */
  const commitDesign = (next) => {
    const selection = state.selection && resolveSelection(next, state.selection.id);
    commit({ design: next, revision: state.revision + 1, selection, history: historyInfo() });
  };

  const travel = (from, to) => {
    if (!from.length) return false;
    to.push(state.design);
    last = { key: null, at: -Infinity }; // the next edit always starts a new step
    commitDesign(from.pop());
    return true;
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Apply domain ops atomically. Returns { ok: true } or { ok: false, error: DomainError }.
     * `coalesce`: a key naming the control; repeated edits under the same key within
     * COALESCE_MS share one undo step.
     */
    dispatch(ops, { coalesce = null } = {}) {
      let next;
      try {
        next = applyOps(state.design, ops, state.catalog);
      } catch (error) {
        if (error instanceof DomainError) return { ok: false, error };
        throw error;
      }
      const at = now();
      const merge = coalesce !== null && coalesce === last.key && at - last.at < COALESCE_MS;
      if (!merge) {
        past.push(state.design);
        if (past.length > HISTORY_LIMIT) past.shift();
      }
      future.length = 0;
      last = { key: coalesce, at };
      commitDesign(next);
      return { ok: true };
    },

    /**
     * Take a design the server produced (an applied chat proposal) with its new revision. It is
     * validated like any input, and it is one undo step like any edit.
     */
    adopt(design, revision) {
      const next = applyOps(design, [], state.catalog);
      if (!Number.isInteger(revision) || revision <= state.revision) {
        throw new DomainError('SCHEMA_INVALID', 'revision', 'the revision must move forward');
      }
      past.push(state.design);
      if (past.length > HISTORY_LIMIT) past.shift();
      future.length = 0;
      last = { key: null, at: -Infinity };
      const selection = state.selection && resolveSelection(next, state.selection.id);
      commit({ design: next, revision, selection, history: historyInfo() });
    },

    undo: () => travel(past, future),
    redo: () => travel(future, past),

    select(id) {
      const selection = id === null ? null : resolveSelection(state.design, id);
      // Open doors already reveal the interior, so selecting inside keeps them in place.
      const hideDoors = selection !== null && INTERIOR_KINDS.has(selection.kind)
        && state.ui.doorsVisible && !state.ui.doorsOpen;
      commit({ selection, ui: hideDoors ? { ...state.ui, doorsVisible: false } : state.ui });
    },

    setDoorsVisible(doorsVisible) {
      commit({ ui: { ...state.ui, doorsVisible } });
    },

    setDoorsOpen(doorsOpen) {
      commit({ ui: { ...state.ui, doorsOpen: Boolean(doorsOpen) } });
    },

    setShowClothes(showClothes) {
      commit({ ui: { ...state.ui, showClothes: Boolean(showClothes) } });
    },

    /** Keep the current design as the saved version (A) for hold-to-compare. */
    saveVersion() {
      commit({ version: state.design });
    },

    clearVersion() {
      commit({ version: null, ui: { ...state.ui, comparing: false } });
    },

    /** While on, the viewer shows the saved version instead of the design. No-op without one. */
    setComparing(comparing) {
      const on = Boolean(comparing) && state.version !== null;
      if (on !== state.ui.comparing) commit({ ui: { ...state.ui, comparing: on } });
    },
  };
}
