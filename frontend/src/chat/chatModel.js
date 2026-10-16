// Pure chat view-model (no DOM). The agent arrives in Phase 5; until then a sent message gets
// an honest "not connected" reply and nothing is ever applied to the design.
//
// A proposal is { id, baseRevision, summary, changes: [{ title, detail }] }. It is kept apart from
// the committed design and is only ever "pending" or "stale" (the design changed after it was made).

export const NOT_CONNECTED_MESSAGE =
  "The AI agent isn't connected yet (planned for Phase 5). You can design manually in the Properties panel.";
export const UNAVAILABLE_MESSAGE = "The AI agent isn't available right now. You can keep designing manually in the Properties panel.";
export const STALE_MESSAGE = 'Design changed. Ask the agent to re-propose.';
export const MAX_MESSAGE_LENGTH = 2000;

// Starter prompts shown before the first message. Picking one only fills the composer.
export const SUGGESTIONS = Object.freeze([
  '240 cm wide, 260 cm tall, white, three compartments',
  'Tall wardrobe with sliding doors and a hanging rail',
  'Four shelves on the left, hanging in the middle, three drawers on the right',
]);

export function proposalStatus(proposal, currentRevision) {
  if (!proposal) return null;
  return proposal.baseRevision === currentRevision ? 'pending' : 'stale';
}

/**
 * `agent` (optional) is async ({ messages, design, revision }) -> { reply, proposal | null } and may
 * throw an error with `.code`. Without it the panel stays honest and says the agent isn't connected.
 */
export function createChatModel({ getRevision, getDesign, agent = null }) {
  let busy = false;
  let nextId = 1;
  let proposal = null;
  const messages = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const push = (role, text) => {
    messages.push(Object.freeze({ id: nextId, role, text }));
    nextId += 1;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getMessages: () => [...messages],
    getProposal: () => proposal,
    getProposalStatus: () => proposalStatus(proposal, getRevision()),

    isBusy: () => busy,

    /** A system note in the conversation (e.g. after Undo). Never touches the design. */
    note(text) {
      push('system', text);
      notify();
    },

    /** Start a new conversation: drops the history and any pending proposal (never touches the design). */
    reset() {
      messages.length = 0;
      proposal = null;
      notify();
    },

    /** A customer message. Returns { ok } and never touches the design. */
    send(rawText) {
      const text = String(rawText ?? '').trim();
      if (!text) return { ok: false, reason: 'empty' };
      if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
      if (busy) return { ok: false, reason: 'busy' };
      push('user', text);
      if (!agent) {
        push('system', NOT_CONNECTED_MESSAGE);
        notify();
        return { ok: true };
      }
      busy = true;
      proposal = null; // a new turn supersedes any pending proposal
      notify();
      const history = messages.filter((m) => m.role !== 'system').slice(-20)
        .map((m) => ({ role: m.role, content: m.text }));
      const revision = getRevision();
      agent({ messages: history, design: getDesign(), revision })
        .then((result) => {
          push('assistant', result.reply);
          // A manual edit during the request makes the answer stale: only keep it if still current.
          if (result.proposal && result.proposal.baseRevision === getRevision()) proposal = result.proposal;
          else if (result.proposal) push('system', STALE_MESSAGE);
        })
        .catch((error) => push('system', error?.code === 'AGENT_NOT_CONFIGURED' ? NOT_CONNECTED_MESSAGE : (error?.message || UNAVAILABLE_MESSAGE)))
        .finally(() => { busy = false; notify(); });
      return { ok: true };
    },

    /** Set by the agent integration (Phase 5) or the dev-only demo. */
    setProposal(next) {
      proposal = next;
      notify();
    },

    /** Cancel never changes the design; it only drops the pending proposal. */
    cancelProposal() {
      if (!proposal) return false;
      proposal = null;
      push('system', 'Proposal cancelled. No changes were made.');
      notify();
      return true;
    },

    /** Called after the host applied (or refused) the proposal. */
    resolveProposal(message) {
      proposal = null;
      if (message) push('system', message);
      notify();
    },
  };
}
