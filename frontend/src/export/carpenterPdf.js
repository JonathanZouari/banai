// Builds the carpenter's PDF: overall size, pictures, parts list, per-compartment positions and build notes.
// English only (standard PDF fonts). The text states plainly that the design was not checked for manufacturing.
import { ASSUMPTION_NOTES, buildCutList, countParts } from './cutList.js';

export const PDF_DISCLAIMER = 'Illustrative design and general guidance. Not verified for manufacturing; check every size before cutting.';
export const PDF_FILENAME = 'banai-wardrobe-build-sheet.pdf';

const PAGE = { width: 210, height: 297, margin: 15 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const COLORS = Object.freeze({ ink: [33, 33, 33], muted: [105, 105, 105], accent: [176, 74, 32], line: [210, 205, 200], head: [246, 232, 224] });

/** Standard PDF fonts only cover Latin-1; anything else (e.g. a custom colour name) becomes "?". */
export const safeText = (value) => String(value ?? '').replace(/[^\x20-\x7E -ÿ]/g, '?');
const mm = (value) => `${value}`;

function steps(list) {
  const out = [
    'Cut every panel listed in the parts table. Edge and finish as shown in the Finish column.',
    `Build the carcass: two side panels (${list.overall.height} mm high, ${list.overall.depth} mm deep) with the top and bottom panels between them, so the overall width is ${list.overall.width} mm.`,
    `Fit the back panel to the rear of the carcass (${list.interior.width} x ${list.interior.height} mm opening).`,
  ];
  if (list.partitions.length) {
    out.push(`Fit the vertical partitions. Left face of each, measured from the inside of the left side panel: ${list.partitions.map((p, i) => `partition ${i + 1} at ${p.x} mm`).join(', ')}.`);
  }
  out.push('Fit shelves, drawers and hanging rails at the heights in the compartment table. Heights are measured up from the top face of the bottom panel.');
  if (list.doorType === 'hinged') out.push('Hang the hinged doors on the sides shown in the parts table; the handle goes on the opposite edge.');
  if (list.doorType === 'sliding') out.push('Fit the top and bottom sliding track across the full interior width, then hang the sliding panels on alternating tracks.');
  return out;
}

export async function buildCarpenterPdf({ design, catalog, views, projectName = 'Custom wardrobe', now = new Date(), compress = true }) {
  const { jsPDF } = await import('jspdf');
  const list = buildCutList(design, catalog);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress });
  let y = PAGE.margin;

  const color = (rgb) => doc.setTextColor(...rgb);
  const text = (value, x, baseline, options = {}) => doc.text(safeText(value), x, baseline, options);
  const heading = (value, size = 13) => {
    doc.setFont('helvetica', 'bold').setFontSize(size);
    color(COLORS.accent);
    text(value, PAGE.margin, y);
    y += size * 0.5;
    doc.setDrawColor(...COLORS.line).line(PAGE.margin, y - 2.5, PAGE.width - PAGE.margin, y - 2.5);
    color(COLORS.ink);
    doc.setFont('helvetica', 'normal').setFontSize(10);
    y += 2;
  };
  const ensure = (needed) => {
    if (y + needed > PAGE.height - 18) {
      doc.addPage();
      y = PAGE.margin;
    }
  };
  const paragraph = (value, { size = 10, indent = 0, gap = 1.5 } = {}) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(safeText(value), CONTENT_WIDTH - indent);
    ensure(lines.length * size * 0.42 + gap);
    doc.text(lines, PAGE.margin + indent, y);
    y += lines.length * size * 0.42 + gap;
  };
  const table = (columns, rows) => {
    const rowHeight = 6;
    const header = () => {
      ensure(rowHeight * 2);
      doc.setFillColor(...COLORS.head).rect(PAGE.margin, y - 4.2, CONTENT_WIDTH, rowHeight, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(9);
      let x = PAGE.margin + 1.5;
      columns.forEach((column) => {
        if (column.align === 'right') text(column.label, x + column.width - 3, y, { align: 'right' });
        else text(column.label, x, y);
        x += column.width;
      });
      doc.setFont('helvetica', 'normal');
      y += rowHeight;
    };
    header();
    rows.forEach((row) => {
      if (y + rowHeight > PAGE.height - 18) {
        doc.addPage();
        y = PAGE.margin;
        header();
      }
      let x = PAGE.margin + 1.5;
      doc.setFontSize(9);
      columns.forEach((column) => {
        const cell = safeText(row[column.key] ?? '');
        const wrapped = doc.splitTextToSize(cell, column.width - 2);
        const fitted = wrapped.length > 1 ? `${wrapped[0].slice(0, -1)}...` : wrapped[0] ?? '';
        if (column.align === 'right') text(fitted, x + column.width - 3, y, { align: 'right' });
        else text(fitted, x, y);
        x += column.width;
      });
      doc.setDrawColor(...COLORS.line).line(PAGE.margin, y + 1.6, PAGE.width - PAGE.margin, y + 1.6);
      y += rowHeight;
    });
    y += 3;
  };
  const picture = (view, imageWidth) => {
    const imageHeight = (imageWidth * view.height) / view.width;
    ensure(imageHeight + 10);
    doc.setFont('helvetica', 'bold').setFontSize(10);
    text(view.title, PAGE.margin, y);
    y += 2;
    doc.addImage(view.dataUrl, 'JPEG', PAGE.margin + (CONTENT_WIDTH - imageWidth) / 2, y, imageWidth, imageHeight);
    doc.setDrawColor(...COLORS.line).rect(PAGE.margin + (CONTENT_WIDTH - imageWidth) / 2, y, imageWidth, imageHeight);
    y += imageHeight + 6;
    doc.setFont('helvetica', 'normal');
  };

  // Page 1: title, overall size, finish, the main picture.
  doc.setFont('helvetica', 'bold').setFontSize(20);
  color(COLORS.ink);
  text('Wardrobe build sheet', PAGE.margin, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  color(COLORS.muted);
  text(`${projectName}  |  ${now.toISOString().slice(0, 10)}  |  All sizes in millimetres`, PAGE.margin, y + 13);
  text(PDF_DISCLAIMER, PAGE.margin, y + 18);
  color(COLORS.ink);
  y += 28;
  heading('Overall size');
  paragraph(`Width ${mm(list.overall.width)}  x  Height ${mm(list.overall.height)}  x  Depth ${mm(list.overall.depth)} mm`, { size: 11 });
  paragraph(`Interior: ${mm(list.interior.width)} wide x ${mm(list.interior.height)} high. Panel thickness ${list.panelThickness} mm. ${list.compartments.length} compartment(s), ${list.partitions.length} partition(s), ${countParts(list)} parts in total.`);
  paragraph(`Carcass finish: ${list.appearance.carcass}.  Doors: ${list.appearance.doors}.`);
  y += 2;
  const [main, ...others] = views;
  if (main) picture(main, 150);

  // Page 2: the other pictures.
  if (others.length) {
    doc.addPage();
    y = PAGE.margin;
    others.forEach((view) => picture(view, 120));
  }

  // Parts table.
  doc.addPage();
  y = PAGE.margin;
  heading('Parts list');
  table(
    [
      { label: 'Part', key: 'name', width: 52 },
      { label: 'Qty', key: 'qty', width: 12, align: 'right' },
      { label: 'Length', key: 'length', width: 20, align: 'right' },
      { label: 'Width', key: 'width', width: 20, align: 'right' },
      { label: 'Thick.', key: 'thickness', width: 18, align: 'right' },
      { label: 'Finish / note', key: 'finishNote', width: 58 },
    ],
    list.parts.map((row) => ({ ...row, finishNote: row.note ? `${row.finish} - ${row.note}` : row.finish })),
  );

  // Compartments.
  ensure(30);
  heading('Compartments (heights up from the top of the bottom panel)');
  table(
    [
      { label: 'No.', key: 'number', width: 12 },
      { label: 'Width', key: 'width', width: 20, align: 'right' },
      { label: 'Shelves at', key: 'shelves', width: 50 },
      { label: 'Drawers (from / height)', key: 'drawers', width: 56 },
      { label: 'Rail at', key: 'rails', width: 42 },
    ],
    list.compartments.map((c) => ({
      number: c.number,
      width: c.width,
      shelves: c.shelves.length ? c.shelves.join(', ') : '-',
      drawers: c.drawers.length ? c.drawers.map((d) => `${d.y} / ${d.height}`).join(', ') : '-',
      rails: c.rails.length ? c.rails.join(', ') : '-',
    })),
  );

  // Steps and notes.
  ensure(40);
  heading('Build order');
  steps(list).forEach((step, index) => paragraph(`${index + 1}. ${step}`, { indent: 3 }));
  y += 2;
  heading('Notes');
  ASSUMPTION_NOTES.forEach((note) => paragraph(`- ${note}`, { indent: 3 }));
  paragraph(`- ${PDF_DISCLAIMER}`, { indent: 3 });

  // Footer on every page.
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal').setFontSize(8);
    color(COLORS.muted);
    text(PDF_DISCLAIMER, PAGE.margin, PAGE.height - 8);
    text(`BanAI  |  page ${page} of ${total}`, PAGE.width - PAGE.margin, PAGE.height - 8, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
