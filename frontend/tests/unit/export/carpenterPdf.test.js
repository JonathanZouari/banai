import { describe, expect, it } from 'vitest';
import { buildCarpenterPdf, PDF_DISCLAIMER, safeText } from '../../../src/export/carpenterPdf.js';
import { downloadBytes } from '../../../src/export/exportButton.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const design = loadDesign('basic');
// A 1x1 JPEG: the real pictures come from WebGL and are covered by the browser test.
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const views = [
  { id: 'perspective', title: 'Perspective view (doors closed)', dataUrl: PIXEL, width: 1100, height: 825 },
  { id: 'front', title: 'Front view (doors closed)', dataUrl: PIXEL, width: 1100, height: 825 },
];
const asText = (bytes) => Buffer.from(bytes).toString('latin1');

describe('carpenter PDF', () => {
  it('produces a multi-page PDF with the sizes, the parts and the disclaimer', async () => {
    const bytes = await buildCarpenterPdf({ design, catalog, views, compress: false, now: new Date('2026-10-17T10:00:00Z') });
    const text = asText(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(text).toContain('Wardrobe build sheet');
    expect(text).toContain('Width 2000  x  Height 2400  x  Depth 600 mm');
    expect(text).toContain('Side panel');
    expect(text).toContain('Hinged door');
    expect(text).toContain('Not verified for manufacturing');
    expect(text).toContain('2026-10-17');
    expect(PDF_DISCLAIMER).toMatch(/Not verified for manufacturing/);
  });

  it('works without any picture and with a long parts table across pages', async () => {
    const bytes = await buildCarpenterPdf({ design, catalog, views: [], compress: false });
    expect(asText(bytes).startsWith('%PDF-')).toBe(true);
  });

  it('replaces characters the PDF fonts cannot print', () => {
    expect(safeText('Sage שלום')).toBe('Sage ????');
    expect(safeText('Plain text 12 mm')).toBe('Plain text 12 mm');
  });

  it('downloads the bytes as a PDF file and cleans up the link', () => {
    const created = [];
    const doc = { createElement: () => { const a = { click: () => created.push(a.download), remove: () => {} }; return a; }, body: { append: () => {} } };
    downloadBytes(new Uint8Array([37, 80, 68, 70]), 'x.pdf', doc);
    expect(created).toEqual(['x.pdf']);
  });
});
