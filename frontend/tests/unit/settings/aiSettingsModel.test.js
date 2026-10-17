import { describe, expect, it, vi } from 'vitest';
import { createAiSettingsModel, maskKey } from '../../../src/settings/aiSettingsModel.js';
import { createKeyStorage, STORAGE_KEY } from '../../../src/settings/keyStorage.js';

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789WXYZ';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), data };
}

const setup = ({ stored, status = 'connected', fail } = {}) => {
  const raw = memoryStorage(stored ? { [STORAGE_KEY]: stored } : {});
  const verify = fail
    ? vi.fn().mockRejectedValue(Object.assign(new Error('Key check failed'), { code: 'REQUEST_FAILED' }))
    : vi.fn().mockResolvedValue({ status, model: null, maskedKey: 'x', checkedAt: '2026-10-16T10:00:00+00:00' });
  const model = createAiSettingsModel({ storage: createKeyStorage(raw), verify });
  return { model, verify, raw };
};

describe('AI settings model', () => {
  it('starts not configured and does not call the backend without a stored key', async () => {
    const { model, verify } = setup();
    await model.load();
    expect(model.getState().status).toBe('not_configured');
    expect(verify).not.toHaveBeenCalled();
  });

  it('re-checks a stored key on load so the UI shows the real status', async () => {
    const { model, verify } = setup({ stored: KEY, status: 'invalid_key' });
    await model.load();
    expect(verify).toHaveBeenCalledWith(KEY);
    expect(model.getState()).toMatchObject({ status: 'invalid_key', maskedKey: maskKey(KEY), busy: false });
  });

  it('saves a key locally only after OpenAI accepted it, and notifies subscribers', async () => {
    const { model, raw } = setup();
    const seen = [];
    model.subscribe((state) => seen.push(state.status));
    await expect(model.saveKey(`  ${KEY}\n`)).resolves.toEqual({ ok: true });
    expect(raw.data.get(STORAGE_KEY)).toBe(KEY);
    expect(model.getState()).toMatchObject({ status: 'connected', maskedKey: 'sk-...WXYZ', error: null });
    expect(seen).toEqual(['checking', 'connected']);
  });

  it.each(['invalid_key', 'unreachable'])('does not save a key when the check says %s', async (status) => {
    const { model, raw } = setup({ status });
    await expect(model.saveKey(KEY)).resolves.toEqual({ ok: false });
    expect(raw.data.has(STORAGE_KEY)).toBe(false);
    expect(model.getState().status).toBe('not_configured');
    expect(model.getState().error).toMatch('לא נשמר');
  });

  it('rejects a malformed key without calling the backend', async () => {
    const { model, verify } = setup();
    await expect(model.saveKey('hello')).resolves.toEqual({ ok: false });
    expect(verify).not.toHaveBeenCalled();
    expect(model.getState().error).toMatch('sk-');
  });

  it('keeps the previous key when the backend request fails', async () => {
    const { model, raw } = setup({ stored: KEY, fail: true });
    await model.saveKey('sk-new-abcdefghijklmnopqrstuvwxyz');
    expect(raw.data.get(STORAGE_KEY)).toBe(KEY);
    expect(model.getState().error).toBe('לא הצלחנו לבדוק את המפתח. נסו שוב.'); // server text is never shown
  });

  it('removes the key from this browser', async () => {
    const { model, raw } = setup({ stored: KEY });
    await model.load();
    model.removeKey();
    expect(raw.data.has(STORAGE_KEY)).toBe(false);
    expect(model.getState()).toMatchObject({ status: 'not_configured', maskedKey: null });
  });

  it('survives storage that throws (private mode)', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    const storage = createKeyStorage(broken);
    expect(storage.get()).toBeNull();
    expect(storage.set(KEY)).toBe(false);
    expect(() => storage.remove()).not.toThrow();
  });
});
