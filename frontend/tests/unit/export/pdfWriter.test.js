import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { renderPdf } from '../../../src/export/pdfWriter.js';
import { buildSpec } from '../../../src/export/specModel.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const fontDir = join(here, '..', '..', '..', 'public', 'fonts');
const bytes = (file) => { const b = readFileSync(join(fontDir, file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const fonts = { regular: bytes('Rubik-Regular.ttf'), medium: bytes('Rubik-Medium.ttf') };
// A 1x1 JPEG stands in for the 3D captures (those need WebGL, so the browser tests cover them).
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const pdfOf = async (design, lang) => {
  const spec = buildSpec(design, catalog, { lang, unit: 'cm', now: new Date('2026-10-20T10:00:00Z') });
  const blob = await renderPdf({ spec, design, fonts, images: { doors: PIXEL, interior: PIXEL } });
  const data = Buffer.from(await blob.arrayBuffer());
  return { blob, data, text: data.toString('latin1') };
};
const pageCount = (text) => (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe('renderPdf', () => {
  it('produces an A4 landscape PDF of at least six pages', async () => {
    const { blob, data, text } = await pdfOf(basic, 'en');
    expect(blob.type).toBe('application/pdf');
    expect(data.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(text)).toBeGreaterThanOrEqual(6);
    expect(text).toMatch(/\/MediaBox \[0 0 841\.8[89]\d* 595\.2[78]\d*\]/);
  });

  it('renders in Hebrew', async () => {
    const { data } = await pdfOf(basic, 'he');
    expect(data.subarray(0, 5).toString()).toBe('%PDF-');
    expect(data.length).toBeGreaterThan(20_000);
  });

  it('handles sliding doors, mirror fronts, no doors and a crowded wardrobe', async () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 3, ids: ['dr_s1', 'dr_s2', 'dr_s3'] }], catalog);
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    const mirror = applyOps(basic, [{ op: 'modify_door', id: 'dr_middle', front: 'mirror' }], catalog);
    for (const design of [sliding, none, mirror, loadDesign('two')]) {
      const { data } = await pdfOf(design, 'en');
      expect(data.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('flows long schedules onto more pages', async () => {
    let crowded = basic;
    for (let i = 0; i < 25; i += 1) {
      crowded = applyOps(crowded, [{ op: 'add_shelf', compartmentId: 'cmp_middle', y: 100 + i * 60, thickness: 18 }], catalog);
    }
    const base = pageCount((await pdfOf(basic, 'en')).text);
    const more = pageCount((await pdfOf(crowded, 'en')).text);
    expect(more).toBeGreaterThan(base);
  });

  it('rejects a font file that is not a TrueType font, without drawing anything', async () => {
    const spec = buildSpec(basic, catalog, { lang: 'en', unit: 'cm', now: new Date('2026-10-20T10:00:00Z') });
    const bad = new TextEncoder().encode('not a font').buffer;
    await expect(renderPdf({ spec, design: basic, fonts: { regular: bad, medium: fonts.medium }, images: { doors: PIXEL, interior: PIXEL } })).rejects.toThrow('not a TrueType font');
  });
});
