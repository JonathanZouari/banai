import { describe, expect, it, vi } from 'vitest';
import { createLanguage, translate } from '../../../src/i18n/strings.js';
import {
  createChatModel, MAX_MESSAGE_LENGTH, NOT_CONNECTED_MESSAGE, proposalStatus, SUGGESTIONS,
} from '../../../src/chat/chatModel.js';

const proposal = (baseRevision = 1) => ({
  id: 'p1',
  baseRevision,
  summary: 'Widen the wardrobe',
  changes: [{ title: 'Width', detail: '200 cm to 240 cm' }],
});

describe('proposalStatus', () => {
  it('is null without a proposal, pending at the same revision, stale after any change', () => {
    expect(proposalStatus(null, 1)).toBeNull();
    expect(proposalStatus(proposal(1), 1)).toBe('pending');
    expect(proposalStatus(proposal(1), 2)).toBe('stale');
  });
});

describe('chat model', () => {
  it('adds the customer message and an honest not-connected reply, and never an assistant answer', () => {
    const model = createChatModel({ getRevision: () => 1 });
    expect(model.send('  240 cm wide  ')).toEqual({ ok: true });
    const messages = model.getMessages();
    expect(messages.map((m) => m.role)).toEqual(['user', 'system']);
    expect(messages[0].text).toBe('240 cm wide');
    expect(messages[1].text).toBe(NOT_CONNECTED_MESSAGE);
    expect(model.getProposal()).toBeNull();
  });

  it('rejects empty and over-long messages without adding anything', () => {
    const model = createChatModel({ getRevision: () => 1 });
    expect(model.send('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(model.send(undefined).ok).toBe(false);
    expect(model.send('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({ ok: false, reason: 'too-long' });
    expect(model.getMessages()).toEqual([]);
  });

  it('gives each message a unique id and notifies subscribers', () => {
    const model = createChatModel({ getRevision: () => 1 });
    let calls = 0;
    const off = model.subscribe(() => { calls += 1; });
    model.send('one');
    model.send('two');
    expect(new Set(model.getMessages().map((m) => m.id)).size).toBe(4);
    expect(calls).toBe(2);
    off();
    model.send('three');
    expect(calls).toBe(2);
  });

  it('marks a pending proposal stale when the revision moves on', () => {
    let revision = 1;
    const model = createChatModel({ getRevision: () => revision });
    model.setProposal(proposal(1));
    expect(model.getProposalStatus()).toBe('pending');
    revision = 2;
    expect(model.getProposalStatus()).toBe('stale');
  });

  it('cancel drops the proposal, leaves a note, and reports false when there is nothing to cancel', () => {
    const model = createChatModel({ getRevision: () => 1 });
    expect(model.cancelProposal()).toBe(false);
    model.setProposal(proposal());
    expect(model.cancelProposal()).toBe(true);
    expect(model.getProposal()).toBeNull();
    expect(model.getMessages().at(-1).text).toMatch(/No changes were made/);
  });

  it('resolveProposal clears the proposal and optionally posts a message', () => {
    const model = createChatModel({ getRevision: () => 1 });
    model.setProposal(proposal());
    model.resolveProposal('Applied.');
    expect(model.getProposal()).toBeNull();
    expect(model.getMessages().at(-1).text).toBe('Applied.');
    model.setProposal(proposal());
    model.resolveProposal();
    expect(model.getMessages()).toHaveLength(1);
  });
});

describe('suggestions', () => {
  it('offers a few short, immutable starter prompts that fit the message limit', () => {
    expect(SUGGESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(Object.isFrozen(SUGGESTIONS)).toBe(true);
    SUGGESTIONS.forEach((text) => {
      expect(text.trim()).toBe(text);
      expect(text.length).toBeLessThan(MAX_MESSAGE_LENGTH);
    });
    expect(new Set(SUGGESTIONS).size).toBe(SUGGESTIONS.length);
  });
});

// Ported from Jonathan's chat model: reply signatures, per-message language and the style-profile step.
describe('chat model with a connected agent (merged behaviour)', () => {
  const languageOf = (code) => {
    const language = createLanguage(null);
    language.set(code);
    return language;
  };
  const model = (agent, language = languageOf('en')) => createChatModel({ getRevision: () => 1, getDesign: () => ({}), agent, language });

  it('sends { role, text } history and keeps the reply signature on the assistant message only', async () => {
    const agent = vi.fn(async () => ({ reply: 'ok', replySignature: 'f'.repeat(64), proposal: null }));
    const chat = model(agent);
    chat.send('hello');
    await vi.waitFor(() => expect(chat.isBusy()).toBe(false));
    expect(agent.mock.calls[0][0].messages).toEqual([{ role: 'user', text: 'hello' }]);
    const [user, reply] = chat.getMessages();
    expect(user).not.toHaveProperty('signature');
    expect(reply).toMatchObject({ role: 'assistant', text: 'ok', signature: 'f'.repeat(64) });
  });

  it('hands each reply (text, signature, language) to onAssistantReply', async () => {
    const onAssistantReply = vi.fn();
    const agent = vi.fn(async () => ({ reply: 'ok', replySignature: 'a'.repeat(64), proposal: null }));
    const chat = createChatModel({ getRevision: () => 1, getDesign: () => ({}), agent, language: languageOf('he'), onAssistantReply });
    chat.send('שלום');
    await vi.waitFor(() => expect(onAssistantReply).toHaveBeenCalled());
    expect(onAssistantReply.mock.calls[0][0]).toMatchObject({ text: 'ok', signature: 'a'.repeat(64), language: 'he' });
  });

  it('stamps messages with the language of their turn, even across a mid-request switch', async () => {
    const language = languageOf('he');
    let release;
    const agent = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const chat = model(agent, language);
    chat.send('תוסיף מדף');
    language.set('en'); // switched while the designer is thinking
    release({ reply: 'אציע מדף.', proposal: null });
    await vi.waitFor(() => expect(chat.isBusy()).toBe(false));
    expect(chat.getMessages().map((m) => [m.role, m.language])).toEqual([['user', 'he'], ['assistant', 'he']]);
    chat.setProposal({ id: 'p', baseRevision: 1, summary: '', changes: [] });
    chat.cancelProposal(); // a new note, in the language chosen now
    expect(chat.getMessages().at(-1)).toMatchObject({ role: 'system', language: 'en', text: translate('en', 'cancelled') });
  });

  it('offers Generate Style Profile when the agent offers it or a change was confirmed, and never piles up', async () => {
    const agent = vi.fn().mockResolvedValue({ reply: 'Great, download it.', offerProfile: true });
    const chat = model(agent, languageOf('he'));
    expect(chat.getBuilt()).toBeNull();
    chat.send('סיימתי');
    await vi.waitFor(() => expect(chat.isBusy()).toBe(false));
    expect(chat.getBuilt()).toEqual({ kind: 'design', language: 'he' });
    chat.noteDesignReady();
    expect(chat.getBuilt()).toEqual({ kind: 'design', language: 'he' });
    expect(chat.getMessages().map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('is connected only with an agent', () => {
    expect(model(vi.fn()).isConnected()).toBe(true);
    expect(createChatModel({ getRevision: () => 1 }).isConnected()).toBe(false);
  });
});
