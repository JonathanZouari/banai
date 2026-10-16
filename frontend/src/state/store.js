// Single committed-state store (no framework). The design only changes through
// domain ops (applyOps); a failed op leaves the state untouched. Snapshots are
// deep-frozen, so consumers can compare by reference.
//
// A pending AI proposal is kept SEPARATE from the committed design: proposeChanges()
// dry-runs the ops on a copy and stores the preview; the committed design changes only
// in applyProposal(), and only if nothing was committed since the proposal was made.
//
// Undo/redo restore earlier committed snapshots (never pending proposals). Every
// commit, undo and redo bumps the revision, so stale-proposal protection still holds.

import { applyOps } from '../domain/apply.js';
import { parseCatalog } from '../domain/catalog.js';
import { DomainError } from '../domain/errors.js';
import { locate } from '../domain/lookup.js';
import { deepFreeze } from '../domain/util.js';
import { diffDesigns } from './diff.js';

const KIND_BY_LOCATION = Object.freeze({
  compartment: 'compartment',
  partition: 'partition',
  door: 'door',
  shelves: 'shelf',
  drawers: 'drawer',
  rails: 'rail',
});
const INTERIOR_KINDS = new Set(['shelf', 'drawer', 'rail', 'compartment', 'partition']);
export const HISTORY_LIMIT = 100;

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
  let past = [];
  let future = [];
  let state = deepFreeze({
    design: validDesign,
    revision,
    catalog: validCatalog,
    selection: null,
    proposal: null,
    // How the most recent proposal ended ({ ops, result: 'applied' | 'cancelled' }), so
    // every view (assistant card, 3D badge) reflects an approval made in any of them.
    proposalOutcome: null,
    history: { canUndo: false, canRedo: false },
    // View preferences only (never part of the design, never in undo history).
    ui: { doorsVisible: true, dimensions: true, room: { wall: '#efe9e1', floor: 'oak' } },
  });
  const listeners = new Set();

  const commit = (patch) => {
    state = deepFreeze({ ...state, ...patch });
    listeners.forEach((listener) => listener(state));
  };

  const historyFlags = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 });

  /** Replace the committed design (from an op batch, undo or redo). */
  const commitDesign = (next) => {
    const selection = state.selection && resolveSelection(next, state.selection.id);
    // A proposal made against the previous design can no longer be applied.
    const proposal = state.proposal && !state.proposal.stale ? { ...state.proposal, stale: true } : state.proposal;
    commit({ design: next, revision: state.revision + 1, selection, proposal, history: historyFlags() });
  };

  const pushHistory = (design) => {
    past = [...past, design].slice(-HISTORY_LIMIT);
    future = [];
  };

  const tryApply = (ops) => {
    try {
      return { ok: true, design: applyOps(state.design, ops, state.catalog) };
    } catch (error) {
      if (error instanceof DomainError) return { ok: false, error };
      throw error;
    }
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Apply domain ops atomically. Returns { ok: true } or { ok: false, error: DomainError }. */
    dispatch(ops) {
      const result = tryApply(ops);
      if (!result.ok) return result;
      pushHistory(state.design);
      commitDesign(result.design);
      return { ok: true };
    },

    undo() {
      if (!past.length) return false;
      future = [...future, state.design];
      const previous = past.at(-1);
      past = past.slice(0, -1);
      commitDesign(previous);
      return true;
    },

    redo() {
      if (!future.length) return false;
      past = [...past, state.design];
      const next = future.at(-1);
      future = future.slice(0, -1);
      commitDesign(next);
      return true;
    },

    /**
     * Stage suggested changes WITHOUT committing them. The ops are dry-run on a copy;
     * invalid ops are rejected and nothing is stored. Returns { ok } or { ok:false, error }.
     */
    proposeChanges({ ops, summary = [], signed = null }) {
      const result = tryApply(ops);
      if (!result.ok) return result;
      commit({
        proposal: {
          ops,
          summary,
          signed, // the server-signed proposal (AI agent), applied through the backend
          baseRevision: state.revision,
          previewDesign: result.design,
          diff: diffDesigns(state.design, result.design),
          // A brand-new wardrobe replaces everything: previewed as a whole, not as a diff.
          replaces: ops.some((op) => op?.op === 'create_wardrobe'),
          stale: false,
        },
      });
      return { ok: true };
    },

    /**
     * Commit the pending proposal. Rejected (code STALE) if the design changed since.
     * `serverDesign` is the authoritative result from POST /api/proposals/apply for a
     * signed proposal; it is re-validated here before it is committed.
     */
    applyProposal({ serverDesign } = {}) {
      const { proposal } = state;
      if (!proposal) return { ok: false, error: { code: 'NO_PROPOSAL' } };
      if (proposal.stale || proposal.baseRevision !== state.revision) {
        if (!proposal.stale) commit({ proposal: { ...proposal, stale: true } });
        return { ok: false, error: { code: 'STALE' } };
      }
      let result;
      if (serverDesign) {
        try {
          result = { ok: true, design: applyOps(serverDesign, [], state.catalog) };
        } catch (error) {
          if (error instanceof DomainError) return { ok: false, error };
          throw error;
        }
      } else {
        result = tryApply(proposal.ops);
      }
      if (!result.ok) return result;
      pushHistory(state.design);
      state = deepFreeze({ ...state, proposal: null, proposalOutcome: { ops: proposal.ops, result: 'applied' } });
      commitDesign(result.design);
      return { ok: true };
    },

    /**
     * Commit a design produced by the server outside a staged proposal (validated like the
     * initial design; invalid data throws and leaves the state untouched). One undo step.
     */
    replaceDesign(design, nextRevision) {
      const next = applyOps(design, [], state.catalog);
      if (!Number.isInteger(nextRevision) || nextRevision <= state.revision) {
        throw new DomainError('SCHEMA_INVALID', 'revision', 'invalid revision');
      }
      pushHistory(state.design);
      const selection = state.selection && resolveSelection(next, state.selection.id);
      commit({ design: next, revision: nextRevision, selection, proposal: null, history: historyFlags() });
    },

    /** The server reported the proposal as stale (409): it can no longer be applied. */
    markProposalStale() {
      if (state.proposal && !state.proposal.stale) commit({ proposal: { ...state.proposal, stale: true } });
    },

    /** Discard the pending proposal (client-only; the committed design is untouched). */
    cancelProposal() {
      if (state.proposal) commit({ proposal: null, proposalOutcome: { ops: state.proposal.ops, result: 'cancelled' } });
    },

    select(id) {
      const selection = id === null ? null : resolveSelection(state.design, id);
      const hideDoors = selection !== null && INTERIOR_KINDS.has(selection.kind) && state.ui.doorsVisible;
      commit({ selection, ui: hideDoors ? { ...state.ui, doorsVisible: false } : state.ui });
    },

    setDoorsVisible(doorsVisible) {
      commit({ ui: { ...state.ui, doorsVisible } });
    },

    setDimensionsVisible(dimensions) {
      commit({ ui: { ...state.ui, dimensions } });
    },

    /** Decorative room style: { wall?: '#rrggbb', floor?: floor type id }. Invalid values are ignored. */
    setRoom({ wall, floor } = {}) {
      const next = { ...state.ui.room };
      if (typeof wall === 'string' && /^#[0-9a-f]{6}$/i.test(wall)) next.wall = wall.toLowerCase();
      if (typeof floor === 'string' && /^[a-z_]{1,20}$/.test(floor)) next.floor = floor;
      commit({ ui: { ...state.ui, room: next } });
    },
  };
}
