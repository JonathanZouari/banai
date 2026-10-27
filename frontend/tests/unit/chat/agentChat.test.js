import { describe, expect, it, vi } from 'vitest';
import { createChatModel, NOT_CONNECTED_MESSAGE, STALE_MESSAGE, UNAVAILABLE_MESSAGE } from '../../../src/chat/chatModel.js';
import { describeOps } from '../../../src/chat/describeOps.js';
import { ApiError, applyProposal, postChat } from '../../../src/api/client.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const proposal = (baseRevision = 1) => ({ id: 's', baseRevision, summary: 'Wider', changes: [] });

function setup(agent, revision = { value: 1 }) {
  const model = createChatModel({ getRevision: () => revision.value, getDesign: () => ({ d: 1 }), agent });
  return { model, revision };
}

describe('chat model with an agent', () => {
  it('sends history + design + revision, shows the reply and keeps the proposal', async () => {
    const agent = vi.fn().mockResolvedValue({ reply: 'Sure', proposal: proposal(1) });
    const { model } = setup(agent);
    expect(model.send('wider')).toEqual({ ok: true });
    expect(model.isBusy()).toBe(true);
    expect(model.send('again')).toEqual({ ok: false, reason: 'busy' });
    await flush();
    expect(agent).toHaveBeenCalledWith({ messages: [{ role: 'user', text: 'wider' }], design: { d: 1 }, revision: 1 });
    expect(model.getMessages().map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(model.getProposal().summary).toBe('Wider');
    expect(model.isBusy()).toBe(false);
  });

  it('drops a proposal when a manual edit happened during the request', async () => {
    const { model, revision } = setup(async () => { revision.value = 2; return { reply: 'ok', proposal: proposal(1) }; });
    model.send('x');
    await flush();
    expect(model.getProposal()).toBeNull();
    expect(model.getMessages().at(-1).text).toBe(STALE_MESSAGE);
  });

  it('shows honest system messages for errors and never a proposal', async () => {
    const { model } = setup(async () => { throw Object.assign(new Error('x'), { code: 'AGENT_UNAVAILABLE' }); });
    model.send('x');
    await flush();
    expect(model.getMessages().at(-1)).toMatchObject({ role: 'system', text: NOT_CONNECTED_MESSAGE });
    const second = setup(async () => { throw new Error(''); }).model;
    second.send('x');
    await flush();
    expect(second.getMessages().at(-1).text).toBe(UNAVAILABLE_MESSAGE);
  });

  it('a new message supersedes a pending proposal and system notes are not sent as history', async () => {
    const agent = vi.fn().mockResolvedValue({ reply: 'r', proposal: null });
    const { model } = setup(agent);
    model.setProposal(proposal(1));
    model.send('hello');
    expect(model.getProposal()).toBeNull();
    await flush();
    model.send('again');
    await flush();
    expect(agent.mock.calls[1][0].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

describe('describeOps', () => {
  it('describes ops in plain language and tolerates unknown ops', () => {
    const rows = describeOps([
      { op: 'update_dimensions', width: 2400 },
      { op: 'add_shelf', compartmentId: 'cmp_left', y: 500 },
      { op: 'mystery' },
    ]);
    expect(rows[0]).toEqual({ title: 'Dimensions', detail: 'width 240 cm' });
    expect(rows[1]).toEqual({ title: 'Add shelf', detail: 'in left at 50 cm' });
    expect(rows[2].title).toBe('Change');
  });

  it('writes lengths in the display unit, never in mm', () => {
    const ops = [{ op: 'update_dimensions', width: 2032 }, { op: 'configure_doors', type: 'sliding', count: 2 }];
    expect(describeOps(ops, 'en', 'in')[0].detail).toBe('width 80 in');
    expect(describeOps(ops, 'he', 'in')[0].detail).toBe('רוחב 80 אינץ׳');
    expect(describeOps(ops, 'en', 'mm')[0].detail).toBe('width 203.2 cm'); // mm is not offered: falls back to cm
    expect(describeOps(ops, 'he')[1].detail).toBe('הזזה, 2 דלתות');
  });

  it('describes handles and mirror fronts in both languages', () => {
    const ops = [{ op: 'set_handles', style: 'long_bar', finish: 'brass' }, { op: 'set_handles', style: 'none' }, { op: 'modify_door', id: 'dr_middle', front: 'mirror' }];
    expect(describeOps(ops).map((r) => r.detail)).toEqual(['long bar, brass', 'no handles', 'middle: mirror']);
    expect(describeOps(ops, 'he').map((r) => r.detail)).toEqual(['מוט ארוך, פליז', 'ללא ידיות', 'דלת אמצעית: מראה']);
  });
});

describe('postChat / applyProposal', () => {
  const reply = (status, body) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

  it('posts JSON and unwraps the envelope', async () => {
    const fetchImpl = reply(200, { success: true, data: { reply: 'hi', proposal: null } });
    await expect(postChat({ a: 1 }, fetchImpl)).resolves.toEqual({ reply: 'hi', proposal: null });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"a":1}' });
  });

  it('throws ApiError with status and code', async () => {
    const error = await applyProposal({}, reply(409, { success: false, error: { code: 'STALE', message: 'Design changed.' } })).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code]).toEqual([409, 'STALE']);
    const network = await postChat({}, vi.fn().mockRejectedValue(new Error('x'))).catch((e) => e);
    expect(network.code).toBe('NETWORK_ERROR');
  });
});

describe('chat model reset', () => {
  it('drops history and any pending proposal without touching the design', async () => {
    const agent = vi.fn().mockResolvedValue({ reply: 'r', proposal: proposal(1) });
    const { model } = setup(agent);
    model.send('hello');
    await flush();
    expect(model.getProposal()).not.toBeNull();
    model.reset();
    expect(model.getMessages()).toEqual([]);
    expect(model.getProposal()).toBeNull();
  });
});
