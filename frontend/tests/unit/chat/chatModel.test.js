import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_ERRORS, createChatModel, MAX_MESSAGE_LENGTH, NOT_CONNECTED_MESSAGE, proposalStatus, SUGGESTIONS,
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

describe('greeting', () => {
  it('shows a fixed opening line once, without calling the agent', () => {
    const respond = vi.fn();
    const model = createChatModel({ getRevision: () => 1, agent: { respond } });
    model.greet('Hello!');
    model.greet('Again');
    expect(model.getMessages()).toEqual([{ id: 1, role: 'assistant', text: 'Hello!' }]);
    expect(respond).not.toHaveBeenCalled();
    expect(model.isBusy()).toBe(false);
  });

  it('does not interrupt a conversation that has already started', () => {
    const model = createChatModel({ getRevision: () => 1 });
    model.send('hi');
    model.greet('Hello!');
    expect(model.getMessages().map((m) => m.role)).toEqual(['user', 'system']);
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

describe('chat model with an agent', () => {
  const raw = {
    id: 'abc', baseRevision: 1, baseHash: 'h', signature: 's', ops: [{ op: 'add_shelf' }],
    summary: '1 change to your wardrobe', changes: [{ title: 'Add shelf', detail: 'In compartment 2' }],
  };
  const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

  it('sends only user/assistant turns, shows the reply, and keeps the signed proposal as raw', async () => {
    const respond = vi.fn().mockResolvedValue({ reply: 'Sure.', proposal: raw });
    const model = createChatModel({ getRevision: () => 1, agent: { respond } });
    expect(model.send('add a shelf')).toEqual({ ok: true });
    expect(model.isBusy()).toBe(true);
    await flush();
    expect(respond).toHaveBeenCalledWith([{ role: 'user', content: 'add a shelf' }]);
    expect(model.getMessages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(model.getProposal().raw).toBe(raw);
    expect(model.getProposal().changes).toEqual(raw.changes);
    expect(model.getProposalStatus()).toBe('pending');
    expect(model.isBusy()).toBe(false);
  });

  it('keeps earlier turns in the history but leaves out system notes', async () => {
    const respond = vi.fn().mockResolvedValue({ reply: 'ok', proposal: null });
    const model = createChatModel({ getRevision: () => 1, agent: { respond } });
    model.send('one');
    await flush();
    model.setProposal(proposal());
    model.cancelProposal(); // adds a system note
    model.send('two');
    await flush();
    expect(respond.mock.calls[1][0]).toEqual([
      { role: 'user', content: 'one' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'two' },
    ]);
  });

  it('ignores a second message while the agent is thinking', async () => {
    let finish;
    const respond = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const model = createChatModel({ getRevision: () => 1, agent: { respond } });
    model.send('first');
    expect(model.send('second')).toEqual({ ok: false, reason: 'busy' });
    finish({ reply: 'done', proposal: null });
    await flush();
    expect(model.send('third').ok).toBe(true);
    expect(respond).toHaveBeenCalledTimes(2);
  });

  it('turns agent failures into a friendly note and leaves no proposal', async () => {
    const respond = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 429 }))
      .mockRejectedValueOnce(new Error('boom'));
    const model = createChatModel({ getRevision: () => 1, agent: { respond } });
    model.send('a');
    await flush();
    model.send('b');
    await flush();
    const notes = model.getMessages().filter((m) => m.role === 'system').map((m) => m.text);
    expect(notes).toEqual([AGENT_ERRORS[429], AGENT_ERRORS.default]);
    expect(model.getProposal()).toBeNull();
    expect(model.isBusy()).toBe(false);
  });

  it('a proposal made for an older revision is stale as soon as it arrives', async () => {
    let revision = 1;
    const respond = vi.fn(async () => { revision = 2; return { reply: '', proposal: raw }; });
    const model = createChatModel({ getRevision: () => revision, agent: { respond } });
    model.send('go');
    await flush();
    expect(model.getProposalStatus()).toBe('stale');
    expect(model.getMessages().map((m) => m.role)).toEqual(['user']);
  });
});
