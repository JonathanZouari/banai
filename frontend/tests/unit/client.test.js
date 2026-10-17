import { describe, expect, it, vi } from 'vitest';
import { ApiError, applyProposal, getCatalog, getDefaultDesign, getHealth, sendChat } from '../../src/api/client.js';

const okResponse = (body) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe('api client', () => {
  it('returns the health payload', async () => {
    const fetchImpl = okResponse({ success: true, data: { status: 'ok' } });
    await expect(getHealth(fetchImpl)).resolves.toEqual({ success: true, data: { status: 'ok' } });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8000/api/health');
  });

  it('unwraps the envelope for catalog and default design', async () => {
    await expect(getCatalog(okResponse({ success: true, data: { colors: [] } }))).resolves.toEqual({ colors: [] });
    await expect(getDefaultDesign(okResponse({ success: true, data: { design: {}, revision: 1 } })))
      .resolves.toEqual({ design: {}, revision: 1 });
  });

  it('throws on HTTP errors and unsuccessful envelopes', async () => {
    await expect(getCatalog(vi.fn().mockResolvedValue({ ok: false, status: 503 }))).rejects.toThrow('503');
    await expect(getCatalog(okResponse({ success: false, error: 'x' }))).rejects.toThrow('unsuccessful');
  });
});

describe('agent calls', () => {
  const ok = (data) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data }) });
  const failure = (status, code) => vi.fn().mockResolvedValue({
    ok: false, status, json: async () => ({ success: false, data: null, error: { code, message: 'nope' } }),
  });
  const payload = { messages: [{ role: 'user', content: 'hi' }], design: { a: 1 }, revision: 3 };

  it('posts the chat request as JSON and unwraps the reply', async () => {
    const fetchImpl = ok({ reply: 'hello', proposal: null });
    await expect(sendChat(payload, fetchImpl)).resolves.toEqual({ reply: 'hello', proposal: null });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/chat');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('sends the chat mode only when one is given', async () => {
    const guided = ok({ reply: 'hi', proposal: null });
    await sendChat({ ...payload, mode: 'guided' }, guided);
    expect(JSON.parse(guided.mock.calls[0][1].body).mode).toBe('guided');
    const plain = ok({ reply: 'hi', proposal: null });
    await sendChat(payload, plain);
    expect(JSON.parse(plain.mock.calls[0][1].body)).not.toHaveProperty('mode');
  });

  it('posts a proposal to apply and returns the new design and revision', async () => {
    const fetchImpl = ok({ design: { b: 2 }, revision: 4 });
    await expect(applyProposal({ design: {}, revision: 3, proposal: { signature: 's' } }, fetchImpl))
      .resolves.toEqual({ design: { b: 2 }, revision: 4 });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:8000/api/proposals/apply');
  });

  it('throws an ApiError carrying the status and the server error code', async () => {
    const error = await applyProposal({ design: {}, revision: 1, proposal: {} }, failure(409, 'STALE')).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'STALE' });
    await expect(sendChat(payload, failure(429, 'RATE_LIMITED'))).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });

  it('turns network failures and non-JSON error pages into ApiErrors', async () => {
    await expect(sendChat(payload, vi.fn().mockRejectedValue(new Error('offline')))).rejects.toMatchObject({ code: 'NETWORK' });
    const html = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
    await expect(sendChat(payload, html)).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });
});
