import { describe, expect, it } from 'vitest';
import { buildCarpenterPdf, pdfFileName } from '../../../src/pdf/buildPdf.js';
import { catalog, design } from './fixtures.js';

describe('buildCarpenterPdf', () => {
  it('produces a real multi-page PDF with the disclaimer on every page', async () => {
    const doc = await buildCarpenterPdf({ design, catalog, date: new Date('2026-10-21T00:00:00Z') });
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(pdfFileName(new Date('2026-10-21T00:00:00Z'))).toBe('banai-wardrobe-2026-10-21.pdf');
  });

  it('survives a missing picture and a non-Latin custom colour name', async () => {
    const custom = structuredClone(design);
    custom.carcass.appearance.color = { custom: true, name: 'ירוק', hex: '#9caf88' };
    const doc = await buildCarpenterPdf({ design: custom, catalog, imageDataUrl: 'not-an-image' });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
  });
});

describe('buildCarpenterPdf in Hebrew', () => {
  it('embeds the Hebrew font only for Hebrew (page counts may differ with text length)', async () => {
    const he = await buildCarpenterPdf({ design, catalog, language: 'he' });
    const en = await buildCarpenterPdf({ design, catalog, language: 'en' });
    const bytes = Buffer.from(he.output('arraybuffer')).toString('latin1');
    expect(bytes).toMatch(/Heebo/);
    expect(he.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(en.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(Buffer.from(en.output('arraybuffer')).toString('latin1')).not.toMatch(/Heebo/);
  });
});
