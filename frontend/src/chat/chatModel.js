// Pure chat view-model (no DOM). With an `agent` ({ respond(history) -> Promise<{ reply, proposal }> })
// a sent message goes to the AI designer; without one it gets an honest "not connected" reply.
// Either way sending never touches the design: a proposal is kept apart from the committed design
// and only the host applies it, after the customer presses Confirm.
//
// A proposal is { id, baseRevision, summary, changes: [{ title, detail }], raw }, where `raw` is the
// server's signed proposal that Confirm sends back unchanged. It is "pending" until the revision moves on.

export const NOT_CONNECTED_MESSAGE =
  "The AI agent isn't connected. You can design manually in the Properties panel.";
export const STALE_MESSAGE = 'Design changed. Ask the agent to re-propose.';
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY = 30;

// Friendly text for failed agent calls (the server's own messages are generic by design).
export const AGENT_ERRORS = Object.freeze({
  429: 'You are sending messages too fast. Please wait a moment and try again.',
  503: 'The AI designer is not available right now. You can keep designing manually.',
  default: 'The AI designer could not answer. Please try again.',
});

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

/** Turn the server's signed proposal into the card's view. Text is data: it is only ever rendered as text. */
export function toViewProposal(raw) {
  return {
    id: raw.id,
    baseRevision: raw.baseRevision,
    summary: raw.summary,
    changes: raw.changes,
    raw,
  };
}

export function createChatModel({ getRevision, agent = null }) {
  let nextId = 1;
  let proposal = null;
  let busy = false;
  const messages = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const push = (role, text) => {
    messages.push(Object.freeze({ id: nextId, role, text }));
    nextId += 1;
  };
  const history = () => messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_HISTORY)
    .map((message) => ({ role: message.role, content: message.text }));

  async function ask() {
    busy = true;
    notify();
    try {
      const answer = await agent.respond(history());
      if (answer.reply) push('assistant', answer.reply);
      if (answer.proposal) proposal = toViewProposal(answer.proposal);
    } catch (error) {
      push('system', AGENT_ERRORS[error?.status] ?? AGENT_ERRORS.default);
    } finally {
      busy = false;
      notify();
    }
  }

  return {
    hasAgent: Boolean(agent),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getMessages: () => [...messages],
    getProposal: () => proposal,
    getProposalStatus: () => proposalStatus(proposal, getRevision()),
    isBusy: () => busy,

    /** A customer message. Returns { ok } and never touches the design. */
    send(rawText) {
      if (busy) return { ok: false, reason: 'busy' };
      const text = String(rawText ?? '').trim();
      if (!text) return { ok: false, reason: 'empty' };
      if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
      push('user', text);
      if (agent) {
        ask();
      } else {
        push('system', NOT_CONNECTED_MESSAGE);
        notify();
      }
      return { ok: true };
    },

    /** Set by the agent integration or the dev-only demo. */
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
