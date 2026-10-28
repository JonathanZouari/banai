// The bridge between a pending proposal and the committed design: what Confirm would change,
// computed by replaying the signed ops on a copy (domain/diff.js). Read-only: the store is
// never written. Only a pending proposal (same revision) gets a diff, so a stale one never
// shows changes against a design that has moved on.
import { proposalChanges } from '../domain/diff.js';

/** getState() => { design, revision, catalog } (the store's snapshot). */
export function createProposalDiff(getState) {
  let memo = { key: null, changes: null };
  return {
    /** Change[] | null (null: stale, nothing to replay, or the engine refused the ops). */
    changesFor(proposal) {
      const { design, revision, catalog } = getState();
      if (!proposal || proposal.baseRevision !== revision) return null;
      const key = `${proposal.id}:${revision}`;
      if (memo.key !== key) memo = { key, changes: proposalChanges(design, proposal.signed?.ops, catalog) };
      return memo.changes;
    },
    catalog: () => getState().catalog,
  };
}
