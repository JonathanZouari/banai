// Assemble the carpenter PDF (A4) with jsPDF. The heavy library is loaded on first use.
import { appearanceLabel, buildPlan, DISCLAIMER, pdfText } from './buildPlan.js';
import { drawFront, drawTopAndSide } from './drawings.js';

const PAGE = { w: 210, h: 297, margin: 15 };
const INK = [40, 30, 25];
const ACCENT = [180, 83, 42];

export const pdfFileName = (date = new Date()) => `banai-wardrobe-${date.toISOString().slice(0, 10)}.pdf`;

function heading(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...ACCENT);
  doc.text(text, PAGE.margin, y);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
}

function wrap(doc, text, width) {
  return doc.splitTextToSize(pdfText(text), width);
}

/**
 * Returns a jsPDF document. `imageDataUrl` is a capture of the live 3D view (optional);
 * `designId` is only printed when the design has really been saved.
 */
export async function buildCarpenterPdf({ design, catalog, imageDataUrl = null, designId = null, date = new Date() }) {
  const { jsPDF } = await import('jspdf');
  const plan = buildPlan(design, catalog);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'BanAI wardrobe: instructions for the carpenter', creator: 'BanAI' });
  const inner = PAGE.w - 2 * PAGE.margin;

  // Page 1: cover with the 3D picture and the overall data.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('Wardrobe: instructions for the carpenter', PAGE.margin, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${date.toISOString().slice(0, 10)}${designId ? `   Design: ${pdfText(designId)}` : ''}`, PAGE.margin, 32);
  if (imageDataUrl) {
    try {
      doc.addImage(imageDataUrl, 'JPEG', PAGE.margin, 38, inner, inner / 1.4, undefined, 'FAST');
    } catch {
      doc.text('(3D picture unavailable)', PAGE.margin, 50);
    }
  }
  let y = 38 + inner / 1.4 + 10;
  heading(doc, 'Overall data', y);
  y += 7;
  doc.setFontSize(10);
  const o = plan.overall;
  [
    `Overall size: ${o.width} x ${o.height} x ${o.depth} mm (width x height x depth)`,
    `Panel thickness: ${o.panelThickness} mm. Interior: ${o.interiorWidth} x ${o.interiorHeight} mm`,
    `Compartments: ${plan.compartmentCount}. Doors: ${plan.doorsType}${plan.doorCount ? ` (${plan.doorCount})` : ''}`,
    `Carcass: ${plan.carcassLook}`,
    `Doors: ${plan.doorsLook}`,
  ].forEach((line) => {
    wrap(doc, line, inner).forEach((l) => { doc.text(l, PAGE.margin, y); y += 5; });
  });

  // Page 2: illustration (front elevation, top and side).
  doc.addPage();
  heading(doc, 'How the wardrobe should look', 22);
  doc.setFontSize(9);
  doc.text('Front view. Dashed lines = doors, red bars = hanging rails, C = compartment, D = drawer. Sizes in mm.', PAGE.margin, 29);
  drawFront(doc, design, { x: PAGE.margin + 10, y: 48, w: inner - 20, h: 142 });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Top view', PAGE.margin, 210);
  doc.text('Side view', PAGE.margin + inner / 2, 210);
  doc.setFont('helvetica', 'normal');
  drawTopAndSide(doc, design, { x: PAGE.margin, y: 218, w: inner / 2 - 12, h: 55 }, { x: PAGE.margin + inner / 2, y: 218, w: inner / 2 - 12, h: 55 });

  // Page 3+: cutting list.
  doc.addPage();
  heading(doc, 'Cutting list (nominal sizes, mm)', 22);
  const cols = [{ t: 'Part', x: 15, w: 46 }, { t: 'Qty', x: 61, w: 10 }, { t: 'Length', x: 71, w: 18 }, { t: 'Width', x: 89, w: 18 }, { t: 'Thick.', x: 107, w: 14 }, { t: 'Material, colour, finish / note', x: 121, w: 74 }];
  let row = 30;
  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    cols.forEach((c) => doc.text(c.t, c.x, row));
    doc.setFont('helvetica', 'normal');
    doc.line(PAGE.margin, row + 1.5, PAGE.w - PAGE.margin, row + 1.5);
    row += 6;
  };
  header();
  plan.parts.forEach((p) => {
    const finish = wrap(doc, `${p.finish}${p.note ? ` / ${p.note}` : ''}`, cols[5].w);
    const height = Math.max(5, finish.length * 4);
    if (row + height > PAGE.h - 25) { doc.addPage(); row = 22; header(); }
    doc.setFontSize(9);
    doc.text(pdfText(p.part), cols[0].x, row);
    doc.text(String(p.qty), cols[1].x, row);
    doc.text(p.length ? String(p.length) : '-', cols[2].x, row);
    doc.text(p.width ? String(p.width) : '-', cols[3].x, row);
    doc.text(p.thickness ? String(p.thickness) : '-', cols[4].x, row);
    doc.setFontSize(8);
    finish.forEach((l, i) => doc.text(l, cols[5].x, row + i * 4));
    row += height;
  });

  // Assembly steps.
  if (row > PAGE.h - 60) { doc.addPage(); row = 22; } else row += 8;
  heading(doc, 'Assembly steps', row);
  row += 8;
  doc.setFontSize(10);
  plan.steps.forEach((step, i) => {
    const lines = wrap(doc, `${i + 1}. ${step}`, inner);
    if (row + lines.length * 5 > PAGE.h - 25) { doc.addPage(); row = 22; }
    lines.forEach((l) => { doc.text(l, PAGE.margin, row); row += 5; });
    row += 1.5;
  });

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(110, 100, 95);
    wrap(doc, DISCLAIMER, inner - 20).forEach((l, n) => doc.text(l, PAGE.margin, PAGE.h - 14 + n * 3.5));
    doc.text(`Page ${i} / ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 10, { align: 'right' });
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
