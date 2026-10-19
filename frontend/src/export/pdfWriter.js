// Minimal PDF 1.4 writer: one full-page JPEG image per A4 page (DCTDecode), no dependencies.
// Pure: page images in, PDF bytes out. Page content is rasterized beforehand (pageRenderer.js),
// so no fonts or text encoding are needed here.

export const A4_POINTS = Object.freeze({ width: 595.28, height: 841.89 });
// A design at the domain caps (20 compartments, 300 unmergeable shelves) measured 37 pages.
export const MAX_PAGES = 60;

const ascii = (text) => new TextEncoder().encode(text);

/**
 * @param {{ jpegBytes: Uint8Array, widthPx: number, heightPx: number }[]} pages
 * @returns {Uint8Array}
 */
export function writePdf(pages) {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PAGES) {
    throw new Error(`writePdf: 1 to ${MAX_PAGES} pages required`);
  }
  for (const page of pages) {
    if (!(page.jpegBytes instanceof Uint8Array) || !Number.isInteger(page.widthPx) || !Number.isInteger(page.heightPx)
      || page.widthPx <= 0 || page.heightPx <= 0) {
      throw new Error('writePdf: invalid page');
    }
  }
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const object = (id, parts) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n`));
    parts.forEach((part) => push(typeof part === 'string' ? ascii(part) : part));
    push(ascii('\nendobj\n'));
  };

  // Object ids: 1 catalog, 2 page tree, then per page: page, content stream, image.
  const pageId = (i) => 3 + i * 3;
  const { width, height } = A4_POINTS;
  push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  pages.forEach((page, i) => {
    const id = pageId(i);
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
    object(id + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    object(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`,
      page.jpegBytes,
      '\nendstream',
    ]);
  });

  const count = 3 + pages.length * 3;
  const xrefOffset = length;
  const pad = (n) => String(n).padStart(10, '0');
  const xref = ['xref', `0 ${count}`, '0000000000 65535 f '];
  for (let id = 1; id < count; id += 1) xref.push(`${pad(offsets[id])} 00000 n `);
  push(ascii(`${xref.join('\n')}\ntrailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  chunks.forEach((chunk) => { out.set(chunk, at); at += chunk.length; });
  return out;
}
