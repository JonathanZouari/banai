// Pure chat view-model (no DOM). With an OpenAI key the agent answers in text (any language,
// wardrobe topics only); without one a sent message gets an honest "not connected" reply.
// Nothing here is ever applied to the design: design proposals arrive in Phase 5.
//
// A proposal is { id, baseRevision, summary, changes: [{ title, detail }] }. It is kept apart from
// the committed design and is only ever "pending" or "stale" (the design changed after it was made).

import { ct } from './chatI18n.js';

export const NOT_CONNECTED_MESSAGE =
  'הסוכן עוד לא מחובר. הוסיפו מפתח OpenAI בהגדרות AI, או המשיכו לתכנן ידנית בפאנל התכנון.';
export const AGENT_ERROR_MESSAGE = 'בוב הבנאי לא הצליח לענות. נסו שוב.';
const HISTORY_LIMIT = 20;
export const STALE_MESSAGE = 'התכנון השתנה מאז ההצעה. בקשו הצעה חדשה.';
export const MAX_MESSAGE_LENGTH = 2000;
// The server's messages are English; the chat speaks Hebrew, so errors are shown by code.
const CHAT_ERRORS = Object.freeze({
  INVALID_KEY: 'OpenAI דחה את המפתח. בדקו אותו בהגדרות AI.',
  INVALID_FORMAT: 'הוסיפו מפתח OpenAI תקין בהגדרות AI.',
  MODEL_UNAVAILABLE: 'למפתח שלכם אין גישה למודל השיחה.',
  OPENAI_RATE_LIMIT: 'OpenAI מגביל כרגע את המפתח הזה, או שהמכסה נגמרה. נסו שוב מאוחר יותר.',
  UPSTREAM: 'שירות ה-AI לא זמין כרגע. נסו שוב בעוד רגע.',
  EMPTY_REPLY: 'התקבלה תשובה ריקה. נסו שוב.',
  BUSY: 'בוב עסוק כרגע. נסו שוב בעוד רגע.',
});


export function proposalStatus(proposal, currentRevision) {
  if (!proposal) return null;
  return proposal.baseRevision === currentRevision ? 'pending' : 'stale';
}

/**
 * `agent` (optional): { isReady(): boolean, reply(history, { spoken }): Promise<string | { reply, proposal? }> },
 * where history is [{ role: 'user'|'assistant', content }] ending with the new customer message and
 * `spoken` says the customer said it out loud (ADR-028). A proposal
 * replaces any pending one; it is never applied here (the host does that after Confirm).
 */
export const MAX_SOURCES = 6;
// Control, invisible and bidi characters and tag characters (as SAFE_TEXT_PATTERN, ADR-036 review).
const UNSAFE_TITLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]|\u{E0000}|[\u{E0001}-\u{E007F}]/gu;

/**
 * The web pages a reply cites, safe to show as links: http(s) only, a title of at most 120 characters (the
 * address when it has none), no duplicates, at most MAX_SOURCES. Anything else from the server is dropped.
 */
export function safeSources(sources) {
  const out = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    let url;
    try {
      url = new URL(String(source?.url ?? ''));
    } catch {
      continue;
    }
    if (!['https:', 'http:'].includes(url.protocol) || out.some((s) => s.url === url.href)) continue;
    const title = Array.from(String(source?.title ?? '').replace(UNSAFE_TITLE, ' ').split(/\s+/).filter(Boolean).join(' ')).slice(0, 120).join('');
    out.push(Object.freeze({ title: title || url.hostname, url: url.href, host: url.hostname.replace(/^www\./, '') }));
    if (out.length === MAX_SOURCES) break;
  }
  return out;
}

export function createChatModel({ getRevision, agent = null }) {
  let nextId = 1;
  let proposal = null;
  let thinking = false;
  let generation = 0; // a cleared conversation drops answers still on their way
  const messages = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  const push = (role, text, sources = []) => {
    messages.push(Object.freeze({ id: nextId, role, text, sources: Object.freeze(safeSources(sources)) }));
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

    /** A customer message (`spoken`: it came from the mic). Returns { ok, done? } and never touches the design. */
    send(rawText, { spoken = false } = {}) {
      const text = String(rawText ?? '').trim();
      if (!text) return { ok: false, reason: 'empty' };
      if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too-long' };
      if (thinking) return { ok: false, reason: 'busy' };
      push('user', text);
      if (!agent?.isReady()) {
        push('system', ct(NOT_CONNECTED_MESSAGE));
        notify();
        return { ok: true };
      }
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.text }));
      thinking = true;
      notify();
      const turn = generation;
      const done = Promise.resolve()
        .then(() => agent.reply(history, { spoken: Boolean(spoken) }))
        .then((answer) => {
          if (turn !== generation) return;
          push('assistant', typeof answer === 'string' ? answer : answer.reply, answer?.sources);
          if (answer?.proposal) proposal = answer.proposal;
        })
        .catch((error) => {
          if (turn !== generation) return;
          push('system', ct(Object.hasOwn(CHAT_ERRORS, error?.code ?? '') ? CHAT_ERRORS[error.code] : AGENT_ERROR_MESSAGE));
        })
        .finally(() => {
          if (turn !== generation) return;
          thinking = false;
          notify();
        });
      return { ok: true, done };
    },

    /** A new or opened project: an empty conversation, no proposal, and no late answer from the old one. */
    clear() {
      generation += 1;
      messages.length = 0;
      proposal = null;
      thinking = false;
      notify();
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
      push('system', ct('ההצעה בוטלה. התכנון לא השתנה.'));
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
