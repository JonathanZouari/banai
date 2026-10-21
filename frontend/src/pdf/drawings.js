// Vector drawings for the carpenter PDF, drawn from the design data (so they always match the
// model). Units: the PDF uses millimetres on paper; design lengths are scaled to fit a box.
import { compartmentXRanges } from '../domain/geometry.js';

const INK = [40, 30, 25];
const ACCENT = [180, 83, 42];
const FILL_PANEL = [232, 222, 212];

function dimension(doc, [x1, y1], [x2, y2], label, { offset = 0, vertical = false } = {}) {
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([], 0);
  if (vertical) {
    const x = x1 + offset;
    doc.line(x, y1, x, y2);
    doc.line(x - 1.2, y1, x + 1.2, y1);
    doc.line(x - 1.2, y2, x + 1.2, y2);
    doc.setTextColor(...ACCENT);
    doc.setFontSize(8);
    doc.text(label, offset > 0 ? x + 3.2 : x - 1.8, (y1 + y2) / 2, { angle: 90, align: 'center' });
  } else {
    const y = y1 + offset;
    doc.line(x1, y, x2, y);
    doc.line(x1, y - 1.2, x1, y + 1.2);
    doc.line(x2, y - 1.2, x2, y + 1.2);
    doc.setTextColor(...ACCENT);
    doc.setFontSize(8);
    doc.text(label, (x1 + x2) / 2, y - 1.5, { align: 'center' });
  }
  doc.setTextColor(...INK);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
}

/** Front elevation with doors drawn dashed over the interior, so the layout stays readable. */
export function drawFront(doc, design, box, fmt = (n) => `${n} mm`) {
  const { width: W, height: H } = design.dimensions;
  const t = design.carcass.panelThickness;
  const s = Math.min(box.w / W, box.h / H);
  const x0 = box.x + (box.w - W * s) / 2;
  const y0 = box.y + (box.h - H * s) / 2;
  const X = (mm) => x0 + mm * s;
  const Y = (mmFromTop) => y0 + mmFromTop * s;
  const fromBottom = (mm) => Y(H - t - mm); // interior y (0 at top of bottom panel) -> paper y

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(...FILL_PANEL);
  doc.rect(X(0), Y(0), W * s, H * s, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.rect(X(t), Y(t), (W - 2 * t) * s, (H - 2 * t) * s, 'FD');

  const ranges = compartmentXRanges(design);
  doc.setFillColor(...FILL_PANEL);
  design.partitions.forEach((p, i) => doc.rect(X(t + ranges[i][1]), Y(t), p.thickness * s, (H - 2 * t) * s, 'FD'));

  doc.setFontSize(7);
  design.compartments.forEach((c, i) => {
    const left = X(t + ranges[i][0]);
    const width = c.width * s;
    doc.setFillColor(...FILL_PANEL);
    c.shelves.forEach((sh) => doc.rect(left, fromBottom(sh.y + sh.thickness), width, sh.thickness * s, 'FD'));
    c.drawers.forEach((d, j) => {
      doc.setFillColor(250, 244, 238);
      doc.rect(left + 0.4, fromBottom(d.y + d.height), width - 0.8, d.height * s, 'FD');
      doc.text(`D${i + 1}.${j + 1}`, left + width / 2, fromBottom(d.y + d.height / 2) + 1, { align: 'center' });
    });
    doc.setLineWidth(0.9);
    doc.setDrawColor(...ACCENT);
    c.rails.forEach((r) => doc.line(left + 1, fromBottom(r.y), left + width - 1, fromBottom(r.y)));
    doc.setLineWidth(0.35);
    doc.setDrawColor(...INK);
    doc.text(`C${i + 1}`, left + width / 2, Y(t) + 3.5, { align: 'center' });
    dimension(doc, [left, Y(H)], [left + width, Y(H)], `${c.width}`, { offset: 6 });
  });

  doc.setLineDashPattern([1.2, 1], 0);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.3);
  if (design.doors.type === 'hinged') {
    design.doors.items.forEach((door) => {
      const idx = door.compartmentIds.map((id) => design.compartments.findIndex((c) => c.id === id));
      const left = X(t + ranges[Math.min(...idx)][0]);
      const right = X(t + ranges[Math.max(...idx)][1]);
      doc.rect(left, Y(t), right - left, (H - 2 * t) * s);
      // hinge side marker
      const hx = door.hingeSide === 'left' ? left : right;
      doc.line(hx, Y(t) + 6, hx, Y(t) + 14);
    });
  } else if (design.doors.type === 'sliding') {
    const n = design.doors.items.length;
    const panelWidth = (W * s) / n;
    for (let i = 0; i < n; i += 1) doc.rect(x0 + i * panelWidth, Y(t) + (i % 2) * 1.2, panelWidth, (H - 2 * t) * s - 1.2);
  }
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...INK);
  dimension(doc, [x0, Y(0)], [x0 + W * s, Y(0)], fmt(W), { offset: -8 });
  dimension(doc, [x0, Y(0)], [x0, Y(H)], fmt(H), { offset: -8, vertical: true });
}

/** Top view (width x depth) and side view (depth x height). */
export function drawTopAndSide(doc, design, topBox, sideBox, fmt = (n) => `${n} mm`) {
  const { width: W, height: H, depth: D } = design.dimensions;
  const t = design.carcass.panelThickness;
  const ranges = compartmentXRanges(design);

  const st = Math.min(topBox.w / W, topBox.h / D);
  const tx = topBox.x + (topBox.w - W * st) / 2;
  const ty = topBox.y + (topBox.h - D * st) / 2;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.setFillColor(...FILL_PANEL);
  doc.rect(tx, ty, W * st, D * st, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.rect(tx + t * st, ty, (W - 2 * t) * st, D * st, 'FD');
  doc.setFillColor(...FILL_PANEL);
  design.partitions.forEach((p, i) => doc.rect(tx + (t + ranges[i][1]) * st, ty, p.thickness * st, D * st, 'FD'));
  dimension(doc, [tx, ty], [tx + W * st, ty], fmt(W), { offset: -5 });
  dimension(doc, [tx + W * st, ty], [tx + W * st, ty + D * st], fmt(D), { offset: 6, vertical: true });

  const ss = Math.min(sideBox.w / D, sideBox.h / H);
  const sx = sideBox.x + (sideBox.w - D * ss) / 2;
  const sy = sideBox.y + (sideBox.h - H * ss) / 2;
  doc.setFillColor(...FILL_PANEL);
  doc.rect(sx, sy, D * ss, H * ss, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.rect(sx, sy + t * ss, D * ss, (H - 2 * t) * ss, 'FD');
  dimension(doc, [sx, sy], [sx + D * ss, sy], fmt(D), { offset: -5 });
  dimension(doc, [sx + D * ss, sy], [sx + D * ss, sy + H * ss], fmt(H), { offset: 6, vertical: true });
}
