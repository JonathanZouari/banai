// Draws the specification as an A4 landscape PDF with jsPDF (loaded on demand). Text, tables and
// drawings are vector; only the two 3D views are images. It describes the design: it never states the
// design can be manufactured, and every page carries that disclaimer.
import { formatLength } from '../ui/units.js';
import { fill, translate } from '../i18n/strings.js';
import { toVisual } from './bidi.js';
import { assertTrueType } from './fontCheck.js';
import { frontElevation, hatch, pickScale, planView } from './elevation.js';

const PAGE = { w: 297, h: 210, margin: 12 };
const TITLE_BLOCK = { y: 184, h: 14 };
const CONTENT = { top: 27, bottom: 176 };
const FONT = 'Rubik';
const INK = [34, 34, 34];
const MUTED = [110, 110, 110];
const ACCENT = [168, 72, 31];
const RULE = [200, 200, 200];
const FILL_SOFT = [236, 232, 226];

export function toBase64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Build the PDF. `fonts` = { regular, medium } (ArrayBuffers of a TTF with Hebrew glyphs),
 * `images` = { doors, interior } (JPEG data URLs). Returns a Blob.
 */
export async function renderPdf({ spec, design, fonts, images }) {
  assertTrueType(fonts.regular);
  assertTrueType(fonts.medium);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${spec.title} ${spec.docNo}`, subject: spec.project, creator: 'BanAI' });
  doc.addFileToVFS('Rubik-Regular.ttf', toBase64(fonts.regular));
  doc.addFont('Rubik-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('Rubik-Medium.ttf', toBase64(fonts.medium));
  doc.addFont('Rubik-Medium.ttf', FONT, 'bold');

  const rtl = spec.dir === 'rtl';
  const tr = (key, values) => fill(translate(spec.lang, key), values);
  const num = (mm) => formatLength(mm, spec.unit);
  const pages = []; // per page: { scale }
  let page = 0;

  // ---- text ---------------------------------------------------------------------------------
  // align: 'start' follows the reading direction (left in English, right in Hebrew).
  const text = (value, x, y, { size = 9, bold = false, color = INK, align = 'start', angle } = {}) => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const side = ['center', 'left', 'right'].includes(align) ? align : (align === 'start') === !rtl ? 'left' : 'right';
    const options = { align: side };
    if (angle) options.angle = angle;
    // Hebrew is put into visual order here (see bidi.js); these options make jsPDF's own engine do nothing.
    if (rtl) Object.assign(options, { isInputVisual: true, isOutputVisual: true, isInputRtl: false, isOutputRtl: false });
    doc.text(rtl ? toVisual(value) : String(value), x, y, options);
  };
  const widthOf = (value, size = 9, bold = false) => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(String(value));
  };
  /** Where text with align 'start' sits inside a box [left, right]. */
  const startX = (left, right, pad = 0) => (rtl ? right - pad : left + pad);

  const stroke = (width, color = INK, dash = null) => {
    doc.setLineWidth(width);
    doc.setDrawColor(...color);
    doc.setLineDashPattern(dash ?? [], 0);
  };

  // ---- pages --------------------------------------------------------------------------------
  const addPage = (heading, { scale = null } = {}) => {
    if (page > 0) doc.addPage();
    page += 1;
    pages.push({ scale });
    if (heading) {
      text(heading, startX(PAGE.margin, PAGE.w - PAGE.margin), 19, { size: 14, bold: true });
      stroke(0.3, RULE);
      doc.line(PAGE.margin, 23, PAGE.w - PAGE.margin, 23);
    }
  };

  // ---- tables -------------------------------------------------------------------------------
  const ROW = 6.4;
  const PAD = 2;
  /** A table that continues on a new page when it runs out of room. Returns the y below it. */
  function table({ heading, columns, rows, y, continued, keep = false }) {
    const total = columns.reduce((sum, c) => sum + c.w, 0);
    const left = PAGE.margin;
    const right = left + total;
    const xOf = (index) => {
      const before = columns.slice(0, index).reduce((sum, c) => sum + c.w, 0);
      return rtl ? PAGE.w - PAGE.margin - before - columns[index].w : left + before;
    };
    const drawHeader = (top) => {
      let cursor = top;
      if (heading) {
        text(heading, startX(PAGE.margin, PAGE.margin + total), cursor + 4, { size: 11, bold: true, color: ACCENT });
        cursor += 7;
      }
      if (columns.some((c) => c.title)) {
        doc.setFillColor(...FILL_SOFT);
        doc.rect(PAGE.margin, cursor, total, ROW, 'F');
        columns.forEach((c, i) => {
          const x0 = xOf(i);
          text(c.title ?? '', startX(x0, x0 + c.w, PAD), cursor + 4.4, { size: 8, bold: true, color: MUTED });
        });
        cursor += ROW;
      }
      return cursor;
    };
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    const measured = rows.map((row) => {
      const cells = row.map((cell, i) => doc.splitTextToSize(String(cell ?? ''), columns[i].w - 2 * PAD));
      return { cells, height: Math.max(ROW, Math.max(1, ...cells.map((c) => c.length)) * 4 + 2.4) };
    });
    const headerHeight = (heading ? 7 : 0) + (columns.some((c) => c.title) ? ROW : 0);
    const wanted = keep ? headerHeight + measured.reduce((sum, m) => sum + m.height, 0) : headerHeight + 2 * ROW;
    // A short table stays in one piece: it moves to the next page rather than splitting.
    if (y + wanted > CONTENT.bottom) {
      addPage(continued);
      y = CONTENT.top;
    }
    let cursor = drawHeader(y);
    measured.forEach(({ cells, height }) => {
      if (cursor + height > CONTENT.bottom) {
        addPage(continued);
        cursor = drawHeader(CONTENT.top);
      }
      cells.forEach((cellLines, i) => {
        const x0 = xOf(i);
        cellLines.forEach((line, n) => text(line, startX(x0, x0 + columns[i].w, PAD), cursor + 4.4 + n * 4, { size: 8.5, bold: Boolean(columns[i].bold) }));
      });
      stroke(0.15, RULE);
      doc.line(left, cursor + height, right, cursor + height);
      cursor += height;
    });
    return cursor + 6;
  }

  // ---- drawings -----------------------------------------------------------------------------
  /** Draw shapes with the drawing's floor-left corner at paper (ox, oy). `den` is the scale denominator. */
  function drawShapes(shapes, ox, oy, den) {
    const X = (mm) => ox + mm / den;
    const Y = (mm) => oy - mm / den;
    shapes.forEach((shape) => {
      if (shape.type === 'line') {
        if (shape.role === 'hinge') stroke(0.18, MUTED, [1.2, 0.9]);
        else if (shape.role === 'mirror') stroke(0.12, [120, 140, 160]);
        else if (shape.role === 'rail') stroke(0.6, [90, 90, 90], [3, 1, 0.6, 1]);
        else stroke(0.25);
        doc.line(X(shape.x1), Y(shape.y1), X(shape.x2), Y(shape.y2));
        return;
      }
      const x = X(shape.x);
      const y = Y(shape.y + shape.h);
      const w = shape.w / den;
      const h = shape.h / den;
      switch (shape.role) {
        case 'outline': stroke(0.55); doc.rect(x, y, w, h, 'S'); break;
        case 'inner': stroke(0.2); doc.rect(x, y, w, h, 'S'); break;
        case 'partition': case 'shelf':
          stroke(0.2); doc.setFillColor(...FILL_SOFT); doc.rect(x, y, w, Math.max(h, 0.35), 'FD'); break;
        case 'drawer': stroke(0.25); doc.setFillColor(250, 250, 250); doc.rect(x, y, w, h, 'FD'); break;
        case 'door': stroke(0.35); doc.setFillColor(255, 255, 255); doc.rect(x, y, w, h, 'FD'); break;
        case 'handle': stroke(0.15); doc.setFillColor(40, 40, 40); doc.rect(x, y, Math.max(w, 0.5), Math.max(h, 0.5), 'F'); break;
        default: stroke(0.25); doc.rect(x, y, w, h, 'S');
      }
    });
  }

  const tick = (x, y) => { doc.line(x - 0.9, y + 0.9, x + 0.9, y - 0.9); };
  /** Dimension chains: bottom (axis x) and right (axis y), levels 1 and 2 at 7 and 14 mm from the drawing. */
  function drawDims(dims, ox, oy, den, { widthMm, floorMm = 0 }) {
    stroke(0.2, MUTED);
    const bottom = oy - floorMm / den;
    const rightEdge = ox + widthMm / den;
    dims.forEach((d) => {
      const offset = d.level === 1 ? 7 : 14;
      const label = num(d.mm);
      if (d.axis === 'x') {
        const yLine = bottom + offset;
        const x1 = ox + d.from / den;
        const x2 = ox + d.to / den;
        stroke(0.15, RULE);
        doc.line(x1, bottom + 1, x1, yLine + 1.5);
        doc.line(x2, bottom + 1, x2, yLine + 1.5);
        stroke(0.2, MUTED);
        doc.line(x1, yLine, x2, yLine);
        tick(x1, yLine);
        tick(x2, yLine);
        if (widthOf(label, 7) + 1 < x2 - x1) text(label, (x1 + x2) / 2, yLine - 1, { size: 7, align: 'center', color: MUTED });
      } else {
        const xLine = rightEdge + offset;
        const y1 = oy - d.from / den;
        const y2 = oy - d.to / den;
        stroke(0.15, RULE);
        doc.line(rightEdge + 1, y1, xLine + 1.5, y1);
        doc.line(rightEdge + 1, y2, xLine + 1.5, y2);
        stroke(0.2, MUTED);
        doc.line(xLine, y1, xLine, y2);
        tick(xLine, y1);
        tick(xLine, y2);
        if (widthOf(label, 7) + 1 < Math.abs(y1 - y2)) {
          // Rotated text reads upwards; its baseline sits just left of the dimension line.
          doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
          doc.text(label, xLine - 1, (y1 + y2) / 2 + widthOf(label, 7) / 2, { angle: 90 });
        }
      }
    });
  }

  function drawTags(tags, ox, oy, den) {
    // Tags are numbers on the drawing, so they are always left-aligned, also in Hebrew.
    tags.forEach((tag) => text(num(tag.mm), ox + tag.x / den + 1, oy - tag.y / den - 0.6, { size: 5.5, color: MUTED, align: 'left' }));
  }

  // ---- title block (stamped on every page once the page count is known) -----------------------
  function stampTitleBlocks() {
    const total = pages.length;
    pages.forEach((meta, index) => {
      doc.setPage(index + 1);
      const left = PAGE.margin;
      const right = PAGE.w - PAGE.margin;
      text(tr('pdfDisclaimerShort'), startX(left, right), TITLE_BLOCK.y - 2.2, { size: 6.8, color: MUTED });
      stroke(0.35);
      doc.rect(left, TITLE_BLOCK.y, right - left, TITLE_BLOCK.h, 'S');
      const cells = [
        { w: 95, label: spec.project, value: spec.title, wide: true },
        { w: 40, label: tr('pdfDocNo'), value: spec.docNo },
        { w: 28, label: tr('pdfDate'), value: spec.dateText },
        { w: 26, label: tr('pdfUnits'), value: spec.unit },
        { w: 26, label: tr('pdfScale'), value: meta.scale ? `1:${meta.scale}` : '–' },
      ];
      const used = cells.reduce((sum, c) => sum + c.w, 0);
      cells.push({ w: right - left - used, label: '', value: tr('pdfPage', { n: index + 1, total }) });
      let cursor = 0;
      cells.forEach((cell, i) => {
        const x0 = rtl ? right - cursor - cell.w : left + cursor;
        if (i > 0) { stroke(0.2); doc.line(rtl ? x0 + cell.w : x0, TITLE_BLOCK.y, rtl ? x0 + cell.w : x0, TITLE_BLOCK.y + TITLE_BLOCK.h); }
        if (cell.label) text(cell.label, startX(x0, x0 + cell.w, 2), TITLE_BLOCK.y + 4.2, { size: 6.5, color: MUTED });
        text(cell.value, startX(x0, x0 + cell.w, 2), TITLE_BLOCK.y + (cell.label ? 10.2 : 8.2), { size: cell.wide ? 9.5 : 8.5, bold: cell.wide });
        cursor += cell.w;
      });
    });
  }

  // ===== Page 1: cover ======================================================================
  addPage(null);
  const coverLeft = PAGE.margin;
  const coverRight = 132;
  text(spec.project, startX(coverLeft, coverRight), 30, { size: 10, bold: true, color: ACCENT });
  text(spec.title, startX(coverLeft, coverRight), 42, { size: 22, bold: true });
  text(spec.overall, startX(coverLeft, coverRight), 52, { size: 12, color: MUTED });
  stroke(0.5, ACCENT);
  doc.line(coverLeft, 57, coverRight, 57);
  table({
    heading: tr('pdfKeyFigures'),
    columns: [{ w: 48, bold: true }, { w: coverRight - coverLeft - 48 }],
    rows: spec.keyFigures,
    y: 64,
    continued: spec.title,
  });
  const imgW = 148;
  const imgH = (imgW * 1100) / 1600;
  const imgX = PAGE.w - PAGE.margin - imgW;
  doc.addImage(images.doors, 'JPEG', imgX, 34, imgW, imgH, undefined, 'FAST');
  stroke(0.2, RULE);
  doc.rect(imgX, 34, imgW, imgH, 'S');
  text(tr('pdfView3dDoors'), startX(imgX, imgX + imgW), 34 + imgH + 5, { size: 8, color: MUTED });

  // ===== Elevations ==========================================================================
  const GEOM = { x: 22, availW: 165, availH: 121 };
  function elevationPage(mode) {
    const base = frontElevation(design, mode);
    const den = pickScale(base.width, base.height, GEOM.availW, GEOM.availH);
    const drawing = frontElevation(design, mode, { hatchMm: Math.round(den * 1.6) });
    addPage(tr(mode === 'closed' ? 'pdfFrontClosed' : 'pdfFrontInterior'), { scale: den });
    const ox = GEOM.x;
    const oy = CONTENT.top + 4 + drawing.height / den;
    drawShapes(drawing.shapes, ox, oy, den);
    if (mode === 'interior') drawTags(drawing.tags, ox, oy, den);
    drawDims(drawing.dims, ox, oy, den, { widthMm: drawing.width });
    return { den, ox, oy, drawing };
  }

  /** A small legend of drawing symbols in the right-hand column. */
  function legend(items, top) {
    const colLeft = 214;
    const colRight = PAGE.w - PAGE.margin;
    text(tr('pdfLegend'), startX(colLeft, colRight), top, { size: 11, bold: true, color: ACCENT });
    let y = top + 8;
    items.forEach(({ key, sample }) => {
      const sx = rtl ? colRight - 12 : colLeft;
      sample(sx, y);
      const tx = rtl ? colRight - 16 : colLeft + 16;
      doc.splitTextToSize(tr(key), colRight - colLeft - 16).forEach((line, n) => text(line, tx, y + 1.4 + n * 3.8, { size: 7.5 }));
      y += 9;
    });
    return y;
  }
  const samples = {
    door: { key: 'pdfLegendDoor', sample: (x, y) => { stroke(0.35); doc.setFillColor(255, 255, 255); doc.rect(x, y - 2.5, 10, 5, 'FD'); } },
    hinge: { key: 'pdfLegendHinge', sample: (x, y) => { stroke(0.18, MUTED, [1.2, 0.9]); doc.line(x, y - 2.5, x + 10, y); doc.line(x, y + 2.5, x + 10, y); } },
    handle: { key: 'pdfLegendHandle', sample: (x, y) => { doc.setFillColor(40, 40, 40); doc.rect(x + 4, y - 2.5, 1.6, 5, 'F'); } },
    mirror: { key: 'pdfLegendMirror', sample: (x, y) => { stroke(0.35); doc.rect(x, y - 2.5, 10, 5, 'S'); drawShapes(hatch(0, 0, 10, 5, 2.2).map((l) => ({ ...l, x1: x + l.x1, x2: x + l.x2, y1: -(y + 2.5 - l.y1), y2: -(y + 2.5 - l.y2) })), 0, 0, 1); } },
    shelf: { key: 'pdfLegendShelf', sample: (x, y) => { stroke(0.2); doc.setFillColor(...FILL_SOFT); doc.rect(x, y - 0.5, 10, 1.2, 'FD'); } },
    drawer: { key: 'pdfLegendDrawer', sample: (x, y) => { stroke(0.25); doc.setFillColor(250, 250, 250); doc.rect(x, y - 2, 10, 4, 'FD'); } },
    rail: { key: 'pdfLegendRail', sample: (x, y) => { stroke(0.6, [90, 90, 90], [3, 1, 0.6, 1]); doc.line(x, y, x + 10, y); } },
  };

  // Page 2: front elevation, doors closed.
  elevationPage('closed');
  const closedLegend = [samples.door, ...(design.doors.type === 'hinged' ? [samples.hinge] : []), ...(design.doors.handles.style === 'none' ? [] : [samples.handle]), ...(design.doors.items.some((d) => d.front === 'mirror') ? [samples.mirror] : [])];
  const afterLegend = legend(closedLegend, CONTENT.top + 4);
  text(tr('pdfDimsNote'), startX(214, PAGE.w - PAGE.margin), afterLegend + 6, { size: 7.5, color: MUTED });

  // Page 3: front elevation of the interior, plus the plan view.
  elevationPage('interior');
  const planTop = legend([samples.shelf, samples.drawer, samples.rail], CONTENT.top + 4) + 6;
  const plan = planView(design);
  const planTotalH = plan.height - plan.minY;
  const planDen = pickScale(plan.width, planTotalH, 56, 38);
  text(tr('pdfPlan'), startX(214, PAGE.w - PAGE.margin), planTop + 4, { size: 11, bold: true, color: ACCENT });
  const planOx = 216;
  const planOy = planTop + 12 + planTotalH / planDen + plan.minY / planDen;
  drawShapes(plan.shapes, planOx, planOy, planDen);
  drawDims(plan.dims, planOx, planOy, planDen, { widthMm: plan.width, floorMm: plan.minY });
  text(`${tr('pdfScale')} 1:${planDen}`, startX(214, PAGE.w - PAGE.margin), planOy - plan.minY / planDen + 14, { size: 7.5, color: MUTED });

  // Page 4: the interior in 3D.
  addPage(tr('pdfView3dInterior'));
  const bigW = 200;
  const bigH = (bigW * 1100) / 1600;
  const bigX = (PAGE.w - bigW) / 2;
  doc.addImage(images.interior, 'JPEG', bigX, CONTENT.top, bigW, bigH, undefined, 'FAST');
  stroke(0.2, RULE);
  doc.rect(bigX, CONTENT.top, bigW, bigH, 'S');

  // Pages 5+: schedules and notes.
  addPage(tr('pdfSchedules'));
  let y = CONTENT.top;
  const fullW = PAGE.w - 2 * PAGE.margin;
  const cont = tr('pdfSchedules');
  y = table({ heading: tr('pdfGeneral'), columns: [{ w: 90, bold: true }, { w: fullW - 90 }], rows: spec.general, y, continued: cont, keep: true });

  const compRows = spec.compartments.flatMap((c) => (c.items.length === 0
    ? [[String(c.no), c.width, tr('pdfEmpty'), '', '']]
    : c.items.map((item, i) => [i === 0 ? String(c.no) : '', i === 0 ? c.width : '', item.label, item.position, item.finish])));
  y = table({
    heading: tr('pdfCompartmentsSchedule'),
    columns: [{ w: 16, title: tr('pdfColNo') }, { w: 30, title: tr('pdfColWidth') }, { w: 60, title: tr('pdfColItem') }, { w: 56, title: tr('pdfColHeight') }, { w: fullW - 162, title: tr('pdfColFinish') }],
    rows: compRows, y, continued: cont,
  });

  if (spec.doors.empty) {
    y = table({ heading: tr('pdfDoorsSchedule'), columns: [{ w: fullW }], rows: [[tr('pdfNoDoors')]], y, continued: cont });
  } else {
    y = table({
      heading: tr('pdfDoorsSchedule'),
      columns: [{ w: 30, title: tr('edDoor') }, { w: 50, title: tr('pdfColCovers') }, { w: 34, title: tr('pdfColHinge') }, { w: 34, title: tr('pdfColFront') }, { w: fullW - 148, title: tr('pdfColFinish') }],
      rows: spec.doors.rows.map((r) => [r.name, r.covers, r.hinge, r.front, r.finish]), y, continued: cont,
    });
    if (spec.doors.sliding) {
      text(tr('pdfSlidingNote'), startX(PAGE.margin, PAGE.w - PAGE.margin), y - 2, { size: 7.5, color: MUTED });
      y += 4;
    }
  }
  y = table({
    heading: tr('pdfMaterialsSchedule'),
    columns: [{ w: 90, bold: true }, { w: fullW - 90 }],
    rows: [...spec.materials, [tr('pdfOverrides'), spec.overrides.length ? '' : tr('pdfNoOverrides')], ...spec.overrides],
    y, continued: cont, keep: spec.overrides.length < 8,
  });
  y = table({ heading: tr('pdfHardware'), columns: [{ w: 90, bold: true }, { w: fullW - 90 }], rows: spec.hardware, y, continued: cont, keep: true });
  table({ heading: tr('pdfNotes'), columns: [{ w: fullW }], rows: spec.notes.map((n) => [n]), y, continued: cont, keep: true });

  stampTitleBlocks();
  return doc.output('blob');
}
