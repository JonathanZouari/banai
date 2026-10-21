// Assemble the carpenter PDF (A4) with jsPDF, in Hebrew (right-to-left, embedded Heebo font) or
// English. The heavy library and the Hebrew font are loaded on first use.
import { appearanceLabel, buildPlan, pdfText } from './buildPlan.js';
import { toVisual } from './bidi.js';
import { drawFront, drawTopAndSide } from './drawings.js';
import { isRtl, pdfStringsFor } from './strings.js';

const PAGE = { w: 210, h: 297, margin: 15 };
const INK = [40, 30, 25];
const ACCENT = [180, 83, 42];

export const pdfFileName = (date = new Date()) => `banai-wardrobe-${date.toISOString().slice(0, 10)}.pdf`;

async function createDocument(language) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  if (isRtl(language)) {
    const { HEEBO_REGULAR, HEEBO_BOLD } = await import('./fonts/heebo.js');
    doc.addFileToVFS('Heebo-Regular.ttf', HEEBO_REGULAR);
    doc.addFont('Heebo-Regular.ttf', 'Heebo', 'normal');
    doc.addFileToVFS('Heebo-Bold.ttf', HEEBO_BOLD);
    doc.addFont('Heebo-Bold.ttf', 'Heebo', 'bold');
    // jsPDF reorders right-to-left text on every text() call. Our own ordering (bidi.js) already
    // produced visual order, so switch its engine to a no-op: input and output both visual, same direction.
    const draw = doc.text.bind(doc);
    doc.text = (value, x, y, options) => draw(value, x, y, { isInputVisual: true, isOutputVisual: true, isInputRtl: false, isOutputRtl: false, ...options });
  }
  return doc;
}

/**
 * Returns a jsPDF document. `imageDataUrl` is a capture of the live 3D view (optional);
 * `designId` is only printed when the design has really been saved; `language` is 'he' or 'en'.
 */
export async function buildCarpenterPdf({ design, catalog, imageDataUrl = null, designId = null, date = new Date(), language = 'en' }) {
  const rtl = isRtl(language);
  const s = pdfStringsFor(language);
  const plan = buildPlan(design, catalog, language);
  const doc = await createDocument(language);
  doc.setProperties({ title: s.title, creator: 'BanAI' });
  const inner = PAGE.w - 2 * PAGE.margin;
  const family = rtl ? 'Heebo' : 'helvetica';
  const text = (value) => (rtl ? toVisual(value) : pdfText(value));
  const edge = rtl ? PAGE.w - PAGE.margin : PAGE.margin; // where a paragraph starts
  const align = rtl ? 'right' : 'left';
  const style = (weight = 'normal', size = 10, color = INK) => {
    doc.setFont(family, weight);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const fmt = (n) => (rtl ? toVisual(`${n} ${s.mm}`) : `${n} mm`);
  const put = (value, x, y, options = {}) => doc.text(text(value), x, y, { align, ...options });
  // Wrap the logical text first (font metrics), then each line is put in visual order by put().
  const wrap = (value, width) => doc.splitTextToSize(rtl ? String(value ?? '') : pdfText(value), width);
  const heading = (value, y) => { style('bold', 14, ACCENT); put(value, edge, y); style(); };

  // Page 1: cover with the 3D picture and the overall data.
  style('bold', 22);
  const titleLines = wrap(s.title, inner);
  titleLines.forEach((line, i) => put(line, edge, 25 + i * 9));
  style('normal', 10);
  put(`${s.date}: ${date.toISOString().slice(0, 10)}${designId ? `   ${s.design}: ${designId}` : ''}`, edge, 25 + titleLines.length * 9 - 2);
  const pictureY = 25 + titleLines.length * 9 + 5;
  if (imageDataUrl) {
    try {
      doc.addImage(imageDataUrl, 'JPEG', PAGE.margin, pictureY, inner, inner / 1.4, undefined, 'FAST');
    } catch {
      put(s.pictureUnavailable, edge, pictureY + 12);
    }
  }
  let y = pictureY + inner / 1.4 + 10;
  heading(s.overallData, y);
  y += 7;
  const o = plan.overall;
  const doorsText = `${s.doorKind[plan.doorsType]}${plan.doorCount ? ` (${plan.doorCount})` : ''}`;
  [
    s.overallSize(o.width, o.height, o.depth),
    s.panelLine(o.panelThickness, o.interiorWidth, o.interiorHeight),
    s.compartmentsLine(plan.compartmentCount, doorsText),
    `${s.carcass}: ${plan.carcassLook}`,
    `${s.doorsLabel}: ${plan.doorsLook}`,
  ].forEach((line) => {
    wrap(line, inner).forEach((l) => { put(l, edge, y); y += 5; });
  });

  // Page 2: illustration (front elevation, top and side).
  doc.addPage();
  heading(s.illustration, 22);
  style('normal', 9);
  wrap(s.legend, inner).forEach((l, i) => put(l, edge, 29 + i * 4.5));
  drawFront(doc, design, { x: PAGE.margin + 10, y: 48, w: inner - 20, h: 142 }, fmt);
  const topX = rtl ? PAGE.margin + inner / 2 : PAGE.margin;
  const sideX = rtl ? PAGE.margin : PAGE.margin + inner / 2;
  style('bold', 10);
  put(s.topView, rtl ? topX + inner / 2 - 12 : topX, 210);
  put(s.sideView, rtl ? sideX + inner / 2 - 12 : sideX, 210);
  style();
  drawTopAndSide(doc, design, { x: topX, y: 218, w: inner / 2 - 12, h: 55 }, { x: sideX, y: 218, w: inner / 2 - 12, h: 55 }, fmt);

  // Page 3+: cutting list (columns mirrored for Hebrew).
  doc.addPage();
  heading(s.cuttingList, 22);
  const widths = [46, 10, 18, 18, 14, 74];
  const lefts = widths.map((_, i) => PAGE.margin + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const cols = s.columns.map((title, i) => ({
    t: title, w: widths[i], x: rtl ? PAGE.w - lefts[i] : lefts[i],
  }));
  let row = 30;
  const header = () => {
    style('bold', 9);
    cols.forEach((c) => put(c.t, c.x, row));
    style();
    doc.line(PAGE.margin, row + 1.5, PAGE.w - PAGE.margin, row + 1.5);
    row += 6;
  };
  header();
  plan.parts.forEach((p) => {
    style('normal', 8);
    const finish = wrap(`${p.finish}${p.note ? ` / ${p.note}` : ''}`, cols[5].w);
    const height = Math.max(5, finish.length * 4);
    if (row + height > PAGE.h - 25) { doc.addPage(); row = 22; header(); }
    style('normal', 9);
    put(p.part, cols[0].x, row);
    [p.qty, p.length, p.width, p.thickness].forEach((value, i) => put(value ? String(value) : '-', cols[i + 1].x, row));
    style('normal', 8);
    finish.forEach((l, i) => put(l, cols[5].x, row + i * 4));
    row += height;
  });

  // Assembly steps.
  if (row > PAGE.h - 60) { doc.addPage(); row = 22; } else row += 8;
  heading(s.assemblySteps, row);
  row += 8;
  style('normal', 10);
  plan.steps.forEach((step, i) => {
    const lines = wrap(`${i + 1}. ${step}`, inner);
    if (row + lines.length * 5 > PAGE.h - 25) { doc.addPage(); row = 22; }
    lines.forEach((l) => { put(l, edge, row); row += 5; });
    row += 1.5;
  });

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    style('normal', 7.5, [110, 100, 95]);
    wrap(s.disclaimer, inner - 20).forEach((l, n) => put(l, edge, PAGE.h - 14 + n * 3.5));
    put(s.page(i, pages), rtl ? PAGE.margin : PAGE.w - PAGE.margin, PAGE.h - 10, { align: rtl ? 'left' : 'right' });
  }
  return doc;
}

/** Saves the PDF (browser download) and returns a blob URL so the page can also offer "Open PDF". */
export async function downloadCarpenterPdf(options) {
  const doc = await buildCarpenterPdf(options);
  const name = pdfFileName(options.date);
  doc.save(name);
  return { name, url: URL.createObjectURL(doc.output('blob')) };
}

export { appearanceLabel };
