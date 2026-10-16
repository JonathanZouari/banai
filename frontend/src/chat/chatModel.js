// Pure chat view-model (no DOM). With an OpenAI key the agent answers in text (any language,
// wardrobe topics only); without one a sent message gets an honest "not connected" reply.
// Nothing here is ever applied to the design: design proposals arrive in Phase 5.
//
// A proposal is { id, baseRevision, summary, changes: [{ title, detail }] }. It is kept apart from
// the committed design and is only ever "pending" or "stale" (the design changed after it was made).

export const NOT_CONNECTED_MESSAGE =
  "The AI agent isn't connected yet. Add your OpenAI key in AI settings, or design manually in the Properties panel.";
export const AGENT_ERROR_MESSAGE = 'The AI designer could not answer. Please try again.';
const HISTORY_LIMIT = 20;
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
 * `agent` (optional): { isReady(): boolean, reply(history): Promise<string> }, where history is
 * [{ role: 'user'|'assistant', content }] ending with the new customer message.
 */
export function createChatModel({ getRevision, agent = null }) {
  let nextId = 1;
  let proposal = null;
  let thinking = false;
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
    isThinking: () => thinking,

    /** A customer message. Returns { ok, done? } and never touches the design. */
    send(rawText) {
      const text = String(rawText ?? '').trim();
      if (!text) return { ok: false, reason: 'empty' };
      if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
      if (thinking) return { ok: false, reason: 'busy' };
      push('user', text);
      if (!agent?.isReady()) {
        push('system', NOT_CONNECTED_MESSAGE);
        notify();
        return { ok: true };
      }
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.text }));
      thinking = true;
      notify();
      const done = Promise.resolve()
        .then(() => agent.reply(history))
        .then((answer) => push('assistant', answer))
        .catch((error) => push('system', error?.message || AGENT_ERROR_MESSAGE))
        .finally(() => {
          thinking = false;
          notify();
        });
      return { ok: true, done };
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
