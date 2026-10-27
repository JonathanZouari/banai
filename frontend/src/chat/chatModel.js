// Pure chat view-model (no DOM). With an `agent` a sent message goes to the AI designer; without one,
// it gets an honest "not connected" reply. Either way nothing is ever applied to the design from here:
// a proposal only changes the design after the customer confirms it.
//
// A proposal is { id, baseRevision, summary, changes: [{ title, detail }] }. It is kept apart from
// the committed design and is only ever "pending" or "stale" (the design changed after it was made).
//
// Once the chat changed the design (a confirmed proposal) or the customer said they are done, one
// pinned note ({ kind: 'design' }) offers Generate Style Profile. It is replaced, never added, so it
// never piles up.

import { errorMessage, translate } from '../i18n/strings.js';

export const NOT_CONNECTED_MESSAGE = translate('en', 'notConnected');
export const UNAVAILABLE_MESSAGE = translate('en', 'unavailable');
export const STALE_MESSAGE = translate('en', 'stale');
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY = 30; // mirrors the backend cap on messages per request

// Starter prompts shown before the first message. Picking one only fills the composer.
export const SUGGESTIONS = Object.freeze(translate('en', 'suggestions'));

export function proposalStatus(proposal, currentRevision) {
  if (!proposal) return null;
  return proposal.baseRevision === currentRevision ? 'pending' : 'stale';
}

/**
 * `agent` (optional) is async ({ messages: [{ role, text }], design, revision })
 * -> { reply, replySignature?, proposal | null, offerProfile? } and may throw an error with `.code`.
 * Without it the panel stays honest and says the agent isn't connected.
 * `onAssistantReply(message)` gets each new reply ({ text, signature, language }), e.g. to read it aloud.
 */
export function createChatModel({ getRevision, getDesign, agent = null, language = null, onAssistantReply = null }) {
  const t = (key) => (language ? language.t(key) : translate('en', key));
  const lang = () => (language ? language.get() : 'en');
  let busy = false;
  let nextId = 1;
  let proposal = null;
  let built = null;
  const messages = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  // Every message remembers the language it was written in, so switching language later never
  // changes how earlier messages look. A reply also keeps its server signature, which read-aloud needs.
  const push = (role, text, written = lang(), signature = null) => {
    const message = Object.freeze({ id: nextId, role, text, language: written, ...(signature && { signature }) });
    messages.push(message);
    nextId += 1;
    return message;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getMessages: () => [...messages],
    getProposal: () => proposal,
    getBuilt: () => built,
    getProposalStatus: () => proposalStatus(proposal, getRevision()),
    isConnected: () => agent !== null,

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
      built = null;
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
        push('system', t('notConnected'));
        notify();
        return { ok: true };
      }
      busy = true;
      proposal = null; // a new turn supersedes any pending proposal
      notify();
      // The reply is written in the language chosen when the message was sent.
      const written = lang();
      const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, text: m.text }));
      const revision = getRevision();
      agent({ messages: history, design: getDesign(), revision })
        .then((result) => {
          const reply = push('assistant', result.reply, written, result.replySignature ?? null);
          onAssistantReply?.(reply); // read aloud only while the Voice switch is on
          // A manual edit during the request makes the answer stale: only keep it if still current.
          if (result.proposal && result.proposal.baseRevision === getRevision()) proposal = result.proposal;
          else if (result.proposal) push('system', t('stale'));
          if (result.offerProfile === true) built = Object.freeze({ kind: 'design', language: written });
        })
        .catch((error) => push('system', errorMessage(lang(), error)))
        .finally(() => { busy = false; notify(); });
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
      push('system', t('cancelled'));
      notify();
      return true;
    },

    /** The design changed through the chat (a confirmed proposal): offer the PDF step. */
    noteDesignReady() {
      built = Object.freeze({ kind: 'design', language: lang() });
      notify();
    },

    /** Called after the host applied (or refused) the proposal. */
    resolveProposal(message) {
      proposal = null;
      if (message) push('system', message);
      notify();
    },
  };
}
