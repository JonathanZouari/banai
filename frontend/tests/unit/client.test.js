import { describe, expect, it, vi } from 'vitest';
import { ApiError, applyProposal, getCatalog, getDefaultDesign, getHealth, sendChat } from '../../src/api/client.js';

const okResponse = (body) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe('api client', () => {
  it('returns the health payload', async () => {
    const fetchImpl = okResponse({ success: true, data: { status: 'ok' } });
    await expect(getHealth(fetchImpl)).resolves.toEqual({ success: true, data: { status: 'ok' } });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8001/api/health');
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

describe('agent api', () => {
  it('posts chat turns as JSON and unwraps the reply', async () => {
    const fetchImpl = okResponse({ success: true, data: { reply: 'hi', proposal: null } });
    const payload = { messages: [{ role: 'user', text: 'hello' }], design: {}, revision: 1 };
    await expect(sendChat(payload, fetchImpl)).resolves.toEqual({ reply: 'hi', proposal: null });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8001/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('surfaces the server error code and status (e.g. a stale proposal)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 409, json: async () => ({ success: false, error: { code: 'STALE', message: 'Design changed' } }),
    });
    const error = await applyProposal({}, fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'STALE', message: 'Design changed' });
  });

  it('reports network failures as status 0', async () => {
    const error = await sendChat({}, vi.fn().mockRejectedValue(new TypeError('offline'))).catch((e) => e);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
