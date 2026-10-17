import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_ERROR_MESSAGE, createChatModel, MAX_MESSAGE_LENGTH, NOT_CONNECTED_MESSAGE, proposalStatus,
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
    expect(model.getMessages().at(-1).text).toMatch(/התכנון לא השתנה/);
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

describe('chat model with the agent', () => {
  const readyAgent = (reply) => ({ isReady: () => true, reply: vi.fn(reply) });

  it('sends the conversation (user and assistant only) and adds the reply', async () => {
    const agent = readyAgent(async () => 'שלום! איך אפשר לעזור?');
    const model = createChatModel({ getRevision: () => 1, agent });
    const { done } = model.send('היי');
    expect(model.isThinking()).toBe(true);
    await done;
    expect(model.isThinking()).toBe(false);
    expect(agent.reply).toHaveBeenCalledWith([{ role: 'user', content: 'היי' }]);
    expect(model.getMessages().map((m) => [m.role, m.text])).toEqual([['user', 'היי'], ['assistant', 'שלום! איך אפשר לעזור?']]);

    await model.send('3 shelves').done;
    expect(agent.reply).toHaveBeenLastCalledWith([
      { role: 'user', content: 'היי' }, { role: 'assistant', content: 'שלום! איך אפשר לעזור?' }, { role: 'user', content: '3 shelves' },
    ]);
  });

  it('refuses a second message while the agent is answering', async () => {
    const model = createChatModel({ getRevision: () => 1, agent: readyAgent(async () => 'ok') });
    const first = model.send('one');
    expect(model.send('two')).toEqual({ ok: false, reason: 'busy' });
    await first.done;
    expect(model.getMessages()).toHaveLength(2);
  });

  it('shows a server error by its code, in Hebrew, and never touches the design', async () => {
    const rejected = Object.assign(new Error('OpenAI rejected the API key.'), { code: 'INVALID_KEY' });
    const model = createChatModel({ getRevision: () => 1, agent: readyAgent(async () => { throw rejected; }) });
    await model.send('hi').done;
    expect(model.getMessages().at(-1)).toMatchObject({ role: 'system', text: 'OpenAI דחה את המפתח. בדקו אותו בהגדרות AI.' });
    expect(model.getProposal()).toBeNull();
  });

  it('never shows an unknown server text: it falls back to the generic note', async () => {
    const model = createChatModel({ getRevision: () => 1, agent: readyAgent(async () => { throw new Error('<b>raw upstream</b>'); }) });
    await model.send('hi').done;
    expect(model.getMessages().at(-1).text).toBe(AGENT_ERROR_MESSAGE);
  });

  it('falls back to the not-connected note when the agent is not ready', () => {
    const agent = { isReady: () => false, reply: vi.fn() };
    const model = createChatModel({ getRevision: () => 1, agent });
    expect(model.send('hi')).toEqual({ ok: true });
    expect(model.getMessages().at(-1).text).toBe(NOT_CONNECTED_MESSAGE);
    expect(agent.reply).not.toHaveBeenCalled();
  });
});
