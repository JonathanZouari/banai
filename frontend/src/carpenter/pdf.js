// Carpenter's PDF: cover with the 3D picture, a dimensioned elevation drawing, cut list,
// hardware and assembly steps. Standard PDF fonts only, so text is limited to Latin-1: any other
// character (e.g. Hebrew in a custom material name) is printed as "?".
import { jsPDF } from 'jspdf';
import { compartmentXRanges } from '../domain/geometry.js';
import { buildPlan } from './buildPlan.js';

const PAGE = { w: 210, h: 297, margin: 15 };
const INK = [40, 36, 32];
const ACCENT = [160, 82, 45];
const MUTED = [120, 114, 108];

export const latin = (text) => String(text).replace(/[^\x20-\x7e -ÿ]/g, '?');

function createWriter(doc) {
  const state = { y: PAGE.margin };
  const api = {
    get y() { return state.y; },
    set y(value) { state.y = value; },
    ensure(height) {
      if (state.y + height > PAGE.h - PAGE.margin) api.newPage();
    },
    newPage() {
      doc.addPage();
      state.y = PAGE.margin;
    },
    heading(text) {
      api.ensure(14);
      doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...ACCENT);
      doc.text(latin(text), PAGE.margin, state.y + 5);
      doc.setDrawColor(...ACCENT).setLineWidth(0.4).line(PAGE.margin, state.y + 7, PAGE.w - PAGE.margin, state.y + 7);
      state.y += 12;
    },
    paragraph(text, { size = 10, color = INK, gap = 1.5 } = {}) {
      doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color);
      const lines = doc.splitTextToSize(latin(text), PAGE.w - 2 * PAGE.margin);
      lines.forEach((line) => {
        api.ensure(size * 0.45 + 1);
        doc.text(line, PAGE.margin, state.y + size * 0.35);
        state.y += size * 0.45;
      });
      state.y += gap;
    },
    table(columns, rows) {
      const widths = columns.map((c) => c.w);
      const row = (cells, { bold = false, fill = null } = {}) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(8.5).setTextColor(...INK);
        const wrapped = cells.map((cell, i) => doc.splitTextToSize(latin(cell), widths[i] - 2));
        const height = Math.max(...wrapped.map((lines) => lines.length)) * 3.8 + 2.4;
        api.ensure(height);
        if (fill) doc.setFillColor(...fill).rect(PAGE.margin, state.y, widths.reduce((a, b) => a + b, 0), height, 'F');
        let x = PAGE.margin;
        wrapped.forEach((lines, i) => {
          lines.forEach((line, n) => doc.text(line, x + 1, state.y + 4 + n * 3.8));
          x += widths[i];
        });
        doc.setDrawColor(215, 210, 203).setLineWidth(0.15).line(PAGE.margin, state.y + height, PAGE.margin + widths.reduce((a, b) => a + b, 0), state.y + height);
        state.y += height;
      };
      row(columns.map((c) => c.label), { bold: true, fill: [240, 233, 224] });
      rows.forEach((cells) => row(cells));
      state.y += 3;
    },
  };
  return api;
}

function dimension(doc, x1, y1, x2, y2, label, { vertical = false } = {}) {
  doc.setDrawColor(...ACCENT).setLineWidth(0.2).line(x1, y1, x2, y2);
  const tick = 1.2;
  if (vertical) {
    doc.line(x1 - tick, y1, x1 + tick, y1).line(x2 - tick, y2, x2 + tick, y2);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...ACCENT);
    doc.text(latin(label), x1 - 1.5, (y1 + y2) / 2, { angle: 90, align: 'center' });
  } else {
    doc.line(x1, y1 - tick, x1, y1 + tick).line(x2, y2 - tick, x2, y2 + tick);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...ACCENT);
    doc.text(latin(label), (x1 + x2) / 2, y1 - 1.2, { align: 'center' });
  }
}

/** Front elevation (doors removed) with dimension lines, drawn to scale into the box (x, y, w, h). */
function drawElevation(doc, design, plan, box) {
  const { width, height, depth } = design.dimensions;
  const t = design.carcass.panelThickness;
  const room = 22; // space for dimension lines on the left and top
  const scale = Math.min((box.w - room) / width, (box.h - room) / height);
  const ox = box.x + room;
  const oy = box.y + room;
  const X = (mm) => ox + mm * scale;
  const Y = (mmFromFloor) => oy + (height - mmFromFloor) * scale;

  doc.setFillColor(250, 246, 240).setDrawColor(...INK).setLineWidth(0.5).rect(X(0), Y(height), width * scale, height * scale, 'FD');
  doc.setFillColor(226, 214, 198);
  doc.rect(X(0), Y(height), t * scale, height * scale, 'FD');
  doc.rect(X(width - t), Y(height), t * scale, height * scale, 'FD');
  doc.rect(X(t), Y(height), (width - 2 * t) * scale, t * scale, 'FD');
  doc.rect(X(t), Y(t), (width - 2 * t) * scale, t * scale, 'FD');

  const ranges = compartmentXRanges(design);
  design.partitions.forEach((p, i) => doc.rect(X(t + ranges[i][1]), Y(height - t), p.thickness * scale, (height - 2 * t) * scale, 'FD'));
  design.compartments.forEach((c, i) => {
    const [x0, x1] = ranges[i];
    c.shelves.forEach((s) => doc.rect(X(t + x0), Y(t + s.y + s.thickness), (x1 - x0) * scale, s.thickness * scale, 'FD'));
    c.drawers.forEach((d) => {
      doc.setFillColor(255, 255, 255).rect(X(t + x0 + 3), Y(t + d.y + d.height - 3), (x1 - x0 - 6) * scale, (d.height - 6) * scale, 'FD');
      doc.setFillColor(226, 214, 198);
    });
    c.rails.forEach((r) => {
      doc.setDrawColor(110, 115, 120).setLineWidth(0.9).line(X(t + x0), Y(t + r.y), X(t + x1), Y(t + r.y));
      doc.setDrawColor(...INK).setLineWidth(0.5);
    });
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTED);
    doc.text(String(i + 1), X(t + (x0 + x1) / 2), Y(height - t) + 4, { align: 'center' });
  });

  if (design.doors.type !== 'none') {
    doc.setLineDashPattern([1.5, 1.2], 0).setDrawColor(...MUTED).setLineWidth(0.25);
    plan.doorOutlines.forEach(([x0, x1]) => doc.rect(X(x0), Y(height - t - 2), (x1 - x0) * scale, (height - 2 * t - 4) * scale));
    doc.setLineDashPattern([], 0);
  }

  // Overall dimensions.
  dimension(doc, X(0), oy - 8, X(width), oy - 8, `${width}`);
  dimension(doc, ox - 12, Y(height), ox - 12, Y(0), `${height}`, { vertical: true });
  // Compartment widths along the top, just under the overall width.
  design.compartments.forEach((c, i) => dimension(doc, X(t + ranges[i][0]), oy - 3, X(t + ranges[i][1]), oy - 3, `${c.width}`));
  // Item heights above the floor, on the left (collected per compartment 1 only to keep the drawing readable).
  doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...MUTED);
  design.compartments.forEach((c, i) => {
    const x = X(t + ranges[i][0]) + 1;
    c.shelves.forEach((s) => doc.text(`${t + s.y + s.thickness}`, x, Y(t + s.y + s.thickness) - 0.8));
    c.rails.forEach((r) => doc.text(`${t + r.y}`, x, Y(t + r.y) - 1.2));
    c.drawers.forEach((d) => doc.text(`${t + d.y + d.height}`, x, Y(t + d.y + d.height) - 0.8));
  });
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
  const bottom = Y(0) + 6;
  doc.text(`Front view, doors removed (dashed = doors). Numbers inside = compartments. Small figures = height above floor, mm. Depth ${depth} mm.`, box.x, bottom + 2);
  return bottom + 6;
}

/** Side view with depth, back panel and shelf depth. */
function drawSide(doc, design, box) {
  const { height, depth } = design.dimensions;
  const t = design.carcass.panelThickness;
  const scale = Math.min((box.w - 16) / depth, (box.h - 12) / height);
  const ox = box.x + 12;
  const oy = box.y + 6;
  doc.setFillColor(250, 246, 240).setDrawColor(...INK).setLineWidth(0.5).rect(ox, oy, depth * scale, height * scale, 'FD');
  doc.setFillColor(226, 214, 198);
  doc.rect(ox, oy, depth * scale, t * scale, 'FD');
  doc.rect(ox, oy + (height - t) * scale, depth * scale, t * scale, 'FD');
  doc.rect(ox + (depth - 6) * scale, oy, 6 * scale, height * scale, 'FD');
  dimension(doc, ox, oy - 2, ox + depth * scale, oy - 2, `${depth}`);
  dimension(doc, ox - 6, oy, ox - 6, oy + height * scale, `${height}`, { vertical: true });
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
  doc.text('Side section (back panel at right)', box.x, oy + height * scale + 6);
}

export function buildCarpenterPdf({ design, catalog, imageDataUrl, imageSize }) {
  const plan = buildPlan(design, catalog);
  const t = design.carcass.panelThickness;
  const ranges = compartmentXRanges(design);
  plan.doorOutlines = design.doors.type === 'hinged'
    ? design.doors.items.map((door) => [
      t + ranges[design.compartments.findIndex((c) => c.id === door.compartmentIds[0])][0],
      t + ranges[design.compartments.findIndex((c) => c.id === door.compartmentIds.at(-1))][1],
    ])
    : design.doors.type === 'sliding'
      ? design.doors.items.map((_, i, all) => {
        const inner = design.dimensions.width - 2 * t;
        const panelW = (inner + (all.length - 1) * 60) / all.length;
        return [t + i * (panelW - 60), t + i * (panelW - 60) + panelW];
      })
      : [];

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = createWriter(doc);

  // Page 1: cover.
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...INK).text('Wardrobe - Carpenter Brief', PAGE.margin, w.y + 8);
  w.y += 14;
  w.paragraph(`${plan.overall.width} W x ${plan.overall.height} H x ${plan.overall.depth} D mm  |  ${design.compartments.length} compartment(s)  |  ${plan.doorType === 'none' ? 'no doors' : `${plan.doorType} doors`}`, { size: 11, color: MUTED, gap: 3 });
  if (imageDataUrl) {
    const maxW = PAGE.w - 2 * PAGE.margin;
    const ratio = imageSize.height / imageSize.width;
    const imgH = Math.min(maxW * ratio, 120);
    const imgW = imgH / ratio;
    doc.setDrawColor(215, 210, 203).setLineWidth(0.2).rect(PAGE.margin, w.y, maxW, imgH);
    doc.addImage(imageDataUrl, 'JPEG', PAGE.margin + (maxW - imgW) / 2, w.y, imgW, imgH);
    w.y += imgH + 3;
    w.paragraph('Illustration of the designed wardrobe (3D view). Illustrative only; the dimensions in this document are authoritative.', { size: 8, color: MUTED, gap: 4 });
  }
  w.heading('Overview');
  w.table(
    [{ label: 'Item', w: 50 }, { label: 'Specification', w: 130 }],
    [
      ['Overall size (mm)', `${plan.overall.width} wide x ${plan.overall.height} high x ${plan.overall.depth} deep`],
      ['Panel thickness', `${plan.panelThickness} mm (carcass), ${plan.cutList.find((p) => p.name === 'Back panel').thickness} mm back panel`],
      ['Carcass material', plan.bodyMaterial],
      ['Doors', plan.doorType === 'none' ? 'None' : `${plan.doorType}, ${design.doors.items.length} - ${plan.doorMaterial}`],
      ['Compartments', plan.compartments.map((c) => `#${c.index}: ${c.width} mm`).join('   ')],
    ],
  );

  // Page 2: drawings.
  w.newPage();
  w.heading('Drawings (all dimensions in mm)');
  const afterFront = drawElevation(doc, design, plan, { x: PAGE.margin, y: w.y, w: PAGE.w - 2 * PAGE.margin, h: 175 });
  w.y = afterFront + 4;
  drawSide(doc, design, { x: PAGE.margin, y: w.y, w: 80, h: 75 });
  w.y += 80;

  // Compartment items.
  w.newPage();
  w.heading('Compartments and fixtures (heights above the floor, mm)');
  w.table(
    [{ label: '#', w: 10 }, { label: 'Inner width', w: 28 }, { label: 'Shelves (top face)', w: 45 }, { label: 'Drawers (bottom - top)', w: 55 }, { label: 'Hanging rail', w: 42 }],
    plan.compartments.map((c) => [
      String(c.index), `${c.width}`,
      c.shelves.length ? c.shelves.map((s) => `${s.y + s.thickness}`).join(', ') : '-',
      c.drawers.length ? c.drawers.map((d) => `${d.y} - ${d.y + d.height}`).join('; ') : '-',
      c.rails.length ? c.rails.map((r) => `${r.y}`).join(', ') : '-',
    ]),
  );

  w.heading('Cut list');
  w.table(
    [{ label: 'Ref', w: 10 }, { label: 'Part', w: 32 }, { label: 'Qty', w: 10 }, { label: 'Length', w: 18 }, { label: 'Width', w: 18 }, { label: 'Thick', w: 14 }, { label: 'Material / notes', w: 78 }],
    plan.cutList.map((p) => [p.ref, p.name, String(p.qty), `${p.length}`, `${p.width}`, `${p.thickness}`, [p.material, p.where].filter(Boolean).join(' - ')]),
  );

  w.heading('Hardware');
  w.table(
    [{ label: 'Item', w: 55 }, { label: 'Qty', w: 14 }, { label: 'Notes', w: 111 }],
    plan.hardware.map((h) => [h.name, String(h.qty), h.note]),
  );

  w.heading('Assembly steps');
  plan.steps.forEach((step, i) => w.paragraph(`${i + 1}. ${step}`));

  w.heading('Notes');
  plan.notes.forEach((note) => w.paragraph(`- ${note}`, { size: 9, color: MUTED }));

  // Footer with page numbers.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p).setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
    doc.text(`BanAI - carpenter brief - page ${p}/${pages}`, PAGE.w / 2, PAGE.h - 8, { align: 'center' });
  }
  return doc;
}
