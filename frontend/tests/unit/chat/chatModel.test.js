import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_ERROR_MESSAGE, createChatModel, MAX_MESSAGE_LENGTH, MAX_SOURCES, NOT_CONNECTED_MESSAGE, proposalStatus, safeSources,
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
    expect(agent.reply).toHaveBeenCalledWith([{ role: 'user', content: 'היי' }], { spoken: false });
    expect(model.getMessages().map((m) => [m.role, m.text])).toEqual([['user', 'היי'], ['assistant', 'שלום! איך אפשר לעזור?']]);

    await model.send('3 shelves').done;
    expect(agent.reply).toHaveBeenLastCalledWith([
      { role: 'user', content: 'היי' }, { role: 'assistant', content: 'שלום! איך אפשר לעזור?' }, { role: 'user', content: '3 shelves' },
    ], { spoken: false });
  });

  it('tells the agent when the message was spoken (ADR-028)', async () => {
    const agent = readyAgent(async () => 'בטח.');
    const model = createChatModel({ getRevision: () => 1, agent });
    await model.send('שתי מגירות', { spoken: true }).done;
    expect(agent.reply).toHaveBeenLastCalledWith([{ role: 'user', content: 'שתי מגירות' }], { spoken: true });
    await model.send('ועוד מדף').done;
    expect(agent.reply).toHaveBeenLastCalledWith(expect.any(Array), { spoken: false });
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

describe('safeSources', () => {
  it('keeps http(s) pages only, cleans titles, drops duplicates and stops at six', () => {
    const sources = safeSources([
      { title: 'Blum \u202ehinges', url: 'https://www.blum.com/hinges' },
      { title: 'again', url: 'https://www.blum.com/hinges' },
      { title: '', url: 'http://example.org/a' },
      { title: 'x', url: 'javascript:alert(1)' },
      { title: 'x', url: 'data:text/html,hi' },
      { title: 'x', url: 'not a url' },
      { title: 'x'.repeat(300), url: 'https://long.example/' },
      ...Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, url: `https://e${i}.example/` })),
    ]);
    expect(sources).toHaveLength(MAX_SOURCES);
    expect(sources[0]).toEqual({ title: 'Blum hinges', url: 'https://www.blum.com/hinges', host: 'blum.com' });
    expect(safeSources([{ title: 'a\u200bb\u{E0041}c\u00ad', url: 'https://z.example/' }])[0].title).toBe('a b c');
    expect(sources[1]).toEqual({ title: 'example.org', url: 'http://example.org/a', host: 'example.org' });
    expect(sources[2].title).toHaveLength(120);
    expect(sources.every((s) => /^https?:/.test(s.url))).toBe(true);
    expect(safeSources(null)).toEqual([]);
    expect(safeSources('https://x.example')).toEqual([]);
  });

  it('a reply keeps its sources; a plain string reply has none', async () => {
    const agent = { isReady: () => true, reply: vi.fn(async () => ({ reply: 'ok', sources: [{ title: 'T', url: 'https://t.example/' }] })) };
    const model = createChatModel({ getRevision: () => 1, agent });
    await model.send('שאלה').done;
    expect(model.getMessages().at(-1)).toMatchObject({ role: 'assistant', text: 'ok', sources: [{ title: 'T', url: 'https://t.example/' }] });
    const plain = createChatModel({ getRevision: () => 1, agent: { isReady: () => true, reply: async () => 'ok' } });
    await plain.send('שאלה').done;
    expect(plain.getMessages().at(-1).sources).toEqual([]);
  });
});
