import { describe, expect, it } from 'vitest';
import { createProposalDiff } from '../../../src/chat/proposalDiff.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const setup = () => {
  const store = createStore({ design: loadDesign('basic'), revision: 1, catalog: loadCatalog() });
  return { store, diff: createProposalDiff(() => store.getState()) };
};
const proposal = (ops, baseRevision = 1) => ({ id: 'prp_1', baseRevision, summary: '', changes: [], signed: { ops } });

describe('createProposalDiff', () => {
  it('lists the changes of a pending proposal and leaves the committed design alone', () => {
    const { store, diff } = setup();
    const before = store.getState();
    const changes = diff.changesFor(proposal([{ op: 'update_dimensions', width: 2400 }]));
    expect(changes[0]).toMatchObject({ subject: 'width', before: 2000, after: 2400 });
    expect(store.getState()).toBe(before); // same snapshot: nothing was committed
    expect(store.getState().design.dimensions.width).toBe(2000);
  });

  it('never diffs a stale proposal (the design moved on after a manual edit)', () => {
    const { store, diff } = setup();
    const pending = proposal([{ op: 'update_dimensions', width: 2400 }]);
    expect(diff.changesFor(pending)).not.toBeNull();
    store.dispatch([{ op: 'update_dimensions', depth: 550 }]);
    expect(diff.changesFor(pending)).toBeNull();
  });

  it('is null without signed ops (the card then shows the agent rows)', () => {
    const { diff } = setup();
    expect(diff.changesFor({ id: 'p', baseRevision: 1, summary: '', changes: [] })).toBeNull();
  });
});
