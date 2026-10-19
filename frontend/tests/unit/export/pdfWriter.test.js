import { describe, expect, it } from 'vitest';
import { MAX_PAGES, writePdf } from '../../../src/export/pdfWriter.js';

const fakeJpeg = (n) => new Uint8Array([0xff, 0xd8, ...Array.from({ length: n }, (_, i) => i % 256), 0xff, 0xd9]);
const page = (n = 10) => ({ jpegBytes: fakeJpeg(n), widthPx: 4, heightPx: 6 });
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('writePdf', () => {
  it('writes a PDF header, one page object per page and an EOF marker', () => {
    const text = latin1(writePdf([page(), page(), page()]));
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(text).toContain('/Count 3');
    expect(text).toContain('/Filter /DCTDecode');
  });

  it('embeds the JPEG bytes unchanged with their exact length', () => {
    const jpeg = fakeJpeg(300);
    const text = latin1(writePdf([{ jpegBytes: jpeg, widthPx: 4, heightPx: 6 }]));
    expect(text).toContain(`/Length ${jpeg.length} >>`);
    expect(text).toContain(latin1(jpeg));
  });

  it('points every xref entry at its object', () => {
    const bytes = writePdf([page(), page(500)]);
    const text = latin1(bytes);
    const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = text.slice(startxref).split('\n').slice(3).filter((line) => / n $/.test(line));
    expect(entries).toHaveLength(8);
    entries.forEach((entry, i) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('rejects empty, oversized or malformed input', () => {
    expect(() => writePdf([])).toThrow();
    expect(() => writePdf(Array.from({ length: MAX_PAGES + 1 }, () => page()))).toThrow();
    expect(() => writePdf([{ jpegBytes: 'x', widthPx: 1, heightPx: 1 }])).toThrow();
    expect(() => writePdf([{ jpegBytes: fakeJpeg(1), widthPx: 0, heightPx: 1 }])).toThrow();
  });
});
