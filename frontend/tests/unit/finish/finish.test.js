import { describe, expect, it, vi } from 'vitest';
import { ApiError, downloadCarpentryPdf } from '../../../src/api/client.js';
import { designSummary } from '../../../src/finish/finishDialog.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const makeStore = () => createStore({ design: loadDesign('basic'), revision: 3, catalog });

describe('finishing a design', () => {
  it('records the final revision and refuses every later change', () => {
    const store = makeStore();
    store.finalize(new Date('2026-10-20T10:00:00Z'));
    expect(store.getState().finalized).toEqual({ revision: 3, at: '2026-10-20T10:00:00.000Z' });

    const result = store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('LOCKED');
    expect(() => store.replaceDesign(store.getState().design, 4)).toThrow(/LOCKED/);
    expect(store.getState().revision).toBe(3);
    expect(store.getState().design.compartments[0].shelves[0].y).toBe(400);
  });

  it('still allows selection and the interior toggle (viewing, not editing)', () => {
    const store = makeStore();
    store.finalize();
    store.select('shf_l1');
    store.setDoorsVisible(false);
    expect(store.getState().selection.id).toBe('shf_l1');
    expect(store.getState().ui.doorsVisible).toBe(false);
  });

  it('finalizing twice keeps the first record', () => {
    const store = makeStore();
    store.finalize(new Date('2026-10-20T10:00:00Z'));
    store.finalize(new Date('2026-10-21T10:00:00Z'));
    expect(store.getState().finalized.at).toBe('2026-10-20T10:00:00.000Z');
  });

  it('summarises the design for the confirmation step', () => {
    expect(designSummary(loadDesign('basic'))).toEqual([
      ['Size (W × H × D)', '200.0 cm × 240.0 cm × 60.0 cm'],
      ['Compartments', '3'],
      ['Shelves / drawers / hanging rails', '7 / 2 / 1'],
      ['Doors', '3 hinged doors'],
    ]);
  });
});

describe('downloadCarpentryPdf', () => {
  it('posts the design and returns the PDF blob', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, blob: async () => pdf });
    const payload = { design: { a: 1 }, revision: 3, language: 'he', images: {} };
    await expect(downloadCarpentryPdf(payload, fetchImpl)).resolves.toBe(pdf);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/carpentry/pdf');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('maps server errors to ApiError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ success: false, error: { code: 'BAD_IMAGE', message: 'bad' } }),
    });
    const error = await downloadCarpentryPdf({}, fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code]).toEqual([422, 'BAD_IMAGE']);
  });
});
