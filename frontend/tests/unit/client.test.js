import { describe, expect, it, vi } from 'vitest';
import { getCatalog, getDefaultDesign, getHealth, verifyAiKey } from '../../src/api/client.js';

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

describe('verifyAiKey', () => {
  it('posts the key as JSON in the body (never in the URL) and unwraps the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { status: 'connected' } }) });
    await expect(verifyAiKey('sk-test', fetchImpl)).resolves.toEqual({ status: 'connected' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/settings/ai/verify');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ apiKey: 'sk-test' }) });
  });

  it('throws with the envelope error code and message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ success: false, error: { code: 'INVALID_FORMAT', message: 'bad key' } }) });
    await expect(verifyAiKey('x', fetchImpl)).rejects.toMatchObject({ code: 'INVALID_FORMAT', message: 'bad key' });
  });
});

describe('getDossier', () => {
  it('sends the carpenter\'s language only when it is not Hebrew (ADR-029)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['%PDF-']) });
    const { getDossier } = await import('../../src/api/client.js');
    await getDossier({ id: 'd' }, { fetchImpl });
    await getDossier({ id: 'd' }, { language: 'ar', fetchImpl });
    const bodies = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[0]).toEqual({ design: { id: 'd' } });
    expect(bodies[1]).toEqual({ design: { id: 'd' }, language: 'ar' });
  });
});
