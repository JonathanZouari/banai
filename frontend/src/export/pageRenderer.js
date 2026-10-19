// Draws the carpenter plan onto A4 canvases (150 dpi), in the BanAI look: the site's logo and
// terracotta palette (styles/tokens.css). Browser only. The browser lays out the text, so Hebrew
// (RTL) and the web fonts work without embedding anything in the PDF. Text is drawn with
// fillText, never parsed as markup, so custom names are always plain data.
import { createLogoMark } from '../ui/logo.js';

export const PAGE = Object.freeze({ width: 1240, height: 1754, margin: 80 });
const DPI = 150;
const BODY = "'DM Sans', Arial, 'Segoe UI', 'Noto Sans Hebrew', sans-serif";
const DISPLAY = "'Bricolage Grotesque', 'DM Sans', Arial, 'Noto Sans Hebrew', sans-serif";
// Mirrors the Material 3 tokens in styles/tokens.css and the logo gradient in ui/logo.js.
const C = Object.freeze({
  primary: '#b4532a',
  primaryDark: '#7d3010',
  primaryLight: '#e9814d',
  container: '#fceae4',
  containerLow: '#fff1ed',
  surface: '#fff8f6',
  outline: '#d8c2bb',
  ink: '#231917',
  muted: '#6f5d57',
  panel: '#ead7cf',
  drawer: '#f6e4de',
  rail: '#85736d',
});
const HEBREW = /[֐-׿]/;
const HEADER_BOTTOM = 190;
const FOOTER_TOP = PAGE.height - 200;
const CONTENT_BOTTOM = FOOTER_TOP - 30;

function createPage() {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.width;
  canvas.height = PAGE.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);
  return { canvas, ctx };
}

function font(ctx, size, weight = 400, family = BODY) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function textStyle(ctx, { size, weight = 400, color = C.ink, family = BODY, rtl = false, align, baseline = 'top' }) {
  font(ctx, size, weight, family);
  ctx.fillStyle = color;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = align ?? (rtl ? 'right' : 'left');
  ctx.textBaseline = baseline;
}

/** Split text into lines that fit maxWidth (word wrap; very long words stay whole). */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Like wrap, but "a · b · c" values only break between whole segments. */
function wrapSegments(ctx, text, maxWidth) {
  const segments = String(text).split(' · ');
  if (segments.length === 1) return wrap(ctx, text, maxWidth);
  const lines = [];
  let line = '';
  for (const segment of segments) {
    const next = line ? `${line} · ${segment}` : segment;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = segment;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r, { fill, stroke, lineWidth = 2 } = {}) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image could not be loaded'));
    image.src = src;
  });
}

/** The site's logo mark (ui/logo.js), rasterized from its inline SVG. */
function logoImage() {
  const mark = createLogoMark({ size: 200 });
  mark.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svgText = new XMLSerializer().serializeToString(mark);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
}

/** Logo mark + "BanAI" wordmark (the "AI" in the logo gradient). Returns its width. */
function drawLogo(ctx, logo, x, y, size, { alignRight = false } = {}) {
  font(ctx, size * 0.72, 800, DISPLAY);
  const banWidth = ctx.measureText('Ban').width;
  const aiWidth = ctx.measureText('AI').width;
  const gap = size * 0.28;
  const total = size + gap + banWidth + aiWidth;
  const left = alignRight ? x - total : x;
  ctx.drawImage(logo, left, y, size, size);
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textY = y + size / 2 + size * 0.03;
  const wordX = left + size + gap;
  ctx.fillStyle = C.ink;
  ctx.fillText('Ban', wordX, textY);
  const gradient = ctx.createLinearGradient(wordX + banWidth, y, wordX + banWidth + aiWidth, y + size);
  gradient.addColorStop(0, C.primaryLight);
  gradient.addColorStop(0.55, C.primary);
  gradient.addColorStop(1, '#8f3a17');
  ctx.fillStyle = gradient;
  ctx.fillText('AI', wordX + banWidth, textY);
  return total;
}

/** Branded header: logo on the reading-start side, document title and date on the other. */
function drawHeader(page, plan, assets, sectionTitle) {
  const { ctx } = page;
  const rtl = plan.dir === 'rtl';
  const start = rtl ? PAGE.width - PAGE.margin : PAGE.margin;
  const end = rtl ? PAGE.margin : PAGE.width - PAGE.margin;
  drawLogo(ctx, assets.logo, start, 56, 64, { alignRight: rtl });
  textStyle(ctx, { size: 24, weight: 700, color: C.primary, rtl, align: rtl ? 'left' : 'right', family: DISPLAY });
  ctx.fillText(plan.title, end, 60);
  textStyle(ctx, { size: 20, weight: 500, color: C.muted, rtl, align: rtl ? 'left' : 'right' });
  ctx.fillText(assets.dateText, end, 96);
  const band = ctx.createLinearGradient(PAGE.margin, 0, PAGE.width - PAGE.margin, 0);
  band.addColorStop(0, C.primaryLight);
  band.addColorStop(0.55, C.primary);
  band.addColorStop(1, C.primaryDark);
  ctx.fillStyle = band;
  ctx.fillRect(PAGE.margin, 140, PAGE.width - 2 * PAGE.margin, 5);
  if (sectionTitle) {
    textStyle(ctx, { size: 38, weight: 800, color: C.ink, rtl, family: DISPLAY });
    ctx.fillText(sectionTitle, start, 168);
  }
}

/** A flowing writer: keeps a y cursor and starts a new branded page when content would overflow. */
function createWriter(plan, assets) {
  const rtl = plan.dir === 'rtl';
  const pages = [];
  let page;
  let y;
  const start = rtl ? PAGE.width - PAGE.margin : PAGE.margin;
  const contentWidth = PAGE.width - 2 * PAGE.margin;
  const style = (size, weight, color) => textStyle(page.ctx, { size, weight, color, rtl });

  const writer = {
    rtl,
    pages,
    start,
    contentWidth,
    get ctx() { return page.ctx; },
    get y() { return y; },
    set y(value) { y = value; },
    newPage(title, { headerOnly = false } = {}) {
      page = createPage();
      pages.push(page);
      drawHeader(page, plan, assets, headerOnly ? null : title);
      y = headerOnly ? HEADER_BOTTOM - 30 : HEADER_BOTTOM + 50;
      writer.sectionTitle = title;
    },
    ensure(height) {
      if (y + height > CONTENT_BOTTOM) writer.newPage(writer.sectionTitle);
    },
    paragraph(text, { size = 26, weight = 400, color = C.ink, indent = 0, gap = 14 } = {}) {
      style(size, weight, color);
      const lines = wrap(page.ctx, text, contentWidth - indent);
      const lineHeight = Math.round(size * 1.4);
      for (const line of lines) {
        writer.ensure(lineHeight);
        style(size, weight, color);
        page.ctx.fillText(line, rtl ? start - indent : start + indent, y);
        y += lineHeight;
      }
      y += gap;
    },
    heading(text) {
      writer.ensure(90);
      y += 10;
      style(30, 800, C.primary);
      font(page.ctx, 30, 800, DISPLAY);
      page.ctx.fillText(text, start, y);
      y += 52;
    },
    numbered(items) {
      items.forEach((item, i) => {
        writer.ensure(44);
        roundRect(page.ctx, rtl ? start - 40 : start, y - 2, 40, 40, 20, { fill: C.container });
        textStyle(page.ctx, { size: 22, weight: 700, color: C.primary, align: 'center' });
        page.ctx.fillText(String(i + 1), rtl ? start - 20 : start + 20, y + 7);
        writer.paragraph(item, { indent: 60, gap: 14 });
      });
    },
    bullets(items) {
      items.forEach((item) => {
        writer.ensure(40);
        page.ctx.fillStyle = C.primary;
        page.ctx.beginPath();
        page.ctx.arc(rtl ? start - 8 : start + 8, y + 18, 5, 0, Math.PI * 2);
        page.ctx.fill();
        writer.paragraph(item, { indent: 32, gap: 6 });
      });
    },
  };
  return writer;
}

/** Horizontal or vertical dimension line with end ticks and a centred value. */
function dimension(ctx, x0, y0, x1, y1, label, { size = 20 } = {}) {
  ctx.strokeStyle = C.primary;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  const vertical = x0 === x1;
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    ctx.moveTo(x - 7, y + (vertical ? 0 : 7));
    ctx.lineTo(x + 7, y - (vertical ? 0 : 7)); // architectural slash ticks
  }
  ctx.stroke();
  ctx.save();
  ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
  if (vertical) ctx.rotate(-Math.PI / 2);
  textStyle(ctx, { size, weight: 700, color: C.primaryDark, align: 'center', baseline: 'middle' });
  const width = ctx.measureText(label).width + 14;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-width / 2, -size * 0.7, width, size * 1.4);
  ctx.fillStyle = C.primaryDark;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/** Front elevation fitted in a box; returns the drawing scale (px per mm). */
function drawElevation(ctx, drawing, box) {
  const pad = { left: 70, right: 20, top: 60, bottom: 70 };
  const availW = box.w - pad.left - pad.right;
  const availH = box.h - pad.top - pad.bottom;
  const scale = Math.min(availW / drawing.width, availH / drawing.height);
  const left = box.x + pad.left + (availW - drawing.width * scale) / 2;
  const top = box.y + pad.top + (availH - drawing.height * scale) / 2;
  const X = (mm) => left + mm * scale;
  const Y = (mm) => top + (drawing.height - mm) * scale; // y from the floor, up
  const rect = (x0, y0, x1, y1, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(X(x0), Y(y1), (x1 - x0) * scale, (y1 - y0) * scale);
    ctx.strokeRect(X(x0), Y(y1), (x1 - x0) * scale, (y1 - y0) * scale);
  };
  const { width, height, panel } = drawing;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  rect(0, 0, width, height, C.surface);
  rect(0, 0, panel, height, C.panel);
  rect(width - panel, 0, width, height, C.panel);
  rect(panel, 0, width - panel, panel, C.panel);
  rect(panel, height - panel, width - panel, height, C.panel);
  drawing.partitions.forEach((p) => rect(p.x, panel, p.x + p.thickness, height - panel, C.panel));
  for (const c of drawing.compartments) {
    c.shelves.forEach((s) => rect(c.x0, s.y, c.x1, s.y + s.thickness, C.panel));
    c.drawers.forEach((d) => {
      rect(c.x0 + 3, d.y + 3, c.x1 - 3, d.y + d.height - 3, C.drawer);
      const mid = (c.x0 + c.x1) / 2;
      roundRect(ctx, X(mid) - 22, Y(d.y + d.height / 2) - 3, 44, 6, 3, { fill: C.rail });
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
    });
    c.rails.forEach((r) => {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.rail;
      ctx.beginPath();
      ctx.moveTo(X(c.x0) + 4, Y(r.y));
      ctx.lineTo(X(c.x1) - 4, Y(r.y));
      ctx.stroke();
      ctx.restore();
    });
    // Item heights (mm above the bottom panel's top face), just above each item.
    textStyle(ctx, { size: 16, weight: 700, color: C.primary, baseline: 'bottom' });
    c.shelves.forEach((s) => ctx.fillText(String(s.y - panel), X(c.x0) + 6, Y(s.y + s.thickness) - 3));
    c.rails.forEach((r) => ctx.fillText(String(r.y - panel), X(c.x0) + 6, Y(r.y) - 6));
  }
  dimension(ctx, X(0), top - 32, X(width), top - 32, String(width), { size: 22 });
  dimension(ctx, X(0) - 40, Y(0), X(0) - 40, Y(height), String(height), { size: 22 });
  drawing.compartments.forEach((c) => dimension(ctx, X(c.x0), Y(0) + 34, X(c.x1), Y(0) + 34, String(c.width), { size: 18 }));
  return scale;
}

/** A measurement card: small label over a bold value. Returns its height. */
function card(ctx, { x, y, w, label, value, rtl }) {
  font(ctx, 18, 600, BODY);
  const labelLines = wrap(ctx, label, w - 32).slice(0, 2);
  font(ctx, 26, 700, BODY);
  const lines = wrapSegments(ctx, value, w - 32);
  const labelH = labelLines.length * 24;
  const h = 34 + labelH + lines.length * 34;
  roundRect(ctx, x, y, w, h, 16, { fill: C.containerLow, stroke: C.outline, lineWidth: 1.5 });
  const tx = rtl ? x + w - 16 : x + 16;
  textStyle(ctx, { size: 18, weight: 600, color: C.muted, rtl });
  labelLines.forEach((line, i) => ctx.fillText(line, tx, y + 14 + i * 24));
  // Numbers and Latin names keep their natural left-to-right order, right-aligned on RTL pages.
  textStyle(ctx, { size: 26, weight: 700, color: C.ink, rtl: rtl && HEBREW.test(value), align: rtl ? 'right' : 'left' });
  lines.forEach((line, i) => ctx.fillText(line, tx, y + 20 + labelH + i * 34));
  return h;
}

/** Sheet 1: the designed sketch-and-measurements page. */
function drawSheet(writer, plan, assets) {
  writer.newPage(plan.pageTitles.sheet);
  const { ctx, rtl } = writer;
  const top = writer.y;
  const gap = 28;
  const sideW = 330;
  const drawW = writer.contentWidth - sideW - gap;
  const blockH = 110;
  const bottom = CONTENT_BOTTOM - blockH - 20;
  const drawX = rtl ? PAGE.width - PAGE.margin - drawW : PAGE.margin;
  const sideX = rtl ? PAGE.margin : PAGE.margin + drawW + gap;

  // Drawing panel.
  roundRect(ctx, drawX, top, drawW, bottom - top, 20, { fill: '#ffffff', stroke: C.outline, lineWidth: 1.5 });
  textStyle(ctx, { size: 20, weight: 700, color: C.muted, rtl });
  ctx.fillText(plan.sheet.drawing, rtl ? drawX + drawW - 22 : drawX + 22, top + 18);
  const scale = drawElevation(ctx, plan.drawing, { x: drawX, y: top + 30, w: drawW, h: bottom - top - 40 });

  // Side column: 3D illustration, then key measurement cards.
  let y = top;
  if (assets.snapshot) {
    const image = assets.snapshot;
    const h = Math.min(300, (image.height / image.width) * sideW);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(sideX, y, sideW, h, 20);
    ctx.clip();
    const s = Math.max(sideW / image.width, h / image.height);
    ctx.drawImage(image, sideX + (sideW - image.width * s) / 2, y + (h - image.height * s) / 2, image.width * s, image.height * s);
    ctx.restore();
    roundRect(ctx, sideX, y, sideW, h, 20, { stroke: C.outline, lineWidth: 1.5 });
    y += h + 8;
    textStyle(ctx, { size: 16, weight: 500, color: C.muted, rtl, align: 'center' });
    ctx.fillText(plan.illustration, sideX + sideW / 2, y);
    y += 34;
  }
  textStyle(ctx, { size: 24, weight: 800, color: C.primary, rtl, family: DISPLAY });
  ctx.fillText(plan.sheet.key, rtl ? sideX + sideW : sideX, y);
  y += 42;
  const cards = [
    plan.overview[0],
    plan.overview[1],
    { label: plan.sheet.compartmentWidths, value: plan.compartmentWidths },
    plan.overview[2],
    plan.overview[4],
    plan.overview[5],
    ...(plan.overview[6] ? [plan.overview[6]] : []),
  ];
  for (const item of cards) {
    if (y + 100 > bottom) break;
    y += card(ctx, { x: sideX, y, w: sideW, label: item.label, value: item.value, rtl }) + 12;
  }

  // Title block along the bottom, like a drawing sheet.
  const by = bottom + 20;
  const paperScale = Math.max(1, Math.round(DPI / 25.4 / scale));
  const cells = [
    { label: plan.sheet.project, value: plan.sheet.projectName },
    { label: plan.sheet.date, value: assets.dateText },
    { label: plan.sheet.units, value: plan.sheet.unitsValue },
    { label: plan.sheet.scale, value: `≈ 1:${paperScale}` },
    { label: plan.sheet.sheet, value: '' }, // "1 / total", filled in by drawFooters
  ];
  const widths = [0.34, 0.2, 0.14, 0.16, 0.16].map((f) => f * writer.contentWidth);
  roundRect(ctx, PAGE.margin, by, writer.contentWidth, blockH, 16, { fill: C.surface, stroke: C.outline, lineWidth: 1.5 });
  let cx = rtl ? PAGE.width - PAGE.margin : PAGE.margin;
  cells.forEach((cell, i) => {
    const w = widths[i];
    const x0 = rtl ? cx - w : cx;
    if (i > 0) {
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rtl ? cx : x0, by + 16);
      ctx.lineTo(rtl ? cx : x0, by + blockH - 16);
      ctx.stroke();
    }
    const tx = rtl ? cx - 20 : x0 + 20;
    textStyle(ctx, { size: 17, weight: 600, color: C.muted, rtl });
    ctx.fillText(cell.label, tx, by + 22);
    textStyle(ctx, { size: 25, weight: 700, color: C.ink, rtl });
    ctx.fillText(cell.value, tx, by + 54);
    if (i === cells.length - 1) writer.sheetCell = { x: tx, y: by + 54 };
    cx = rtl ? cx - w : cx + w;
  });
}

function drawDetails(writer, plan) {
  writer.newPage(plan.pageTitles.details);
  writer.paragraph(plan.units, { size: 22, color: C.muted });
  for (const compartment of plan.compartments) {
    // Keep a compartment's heading together with its lines.
    writer.ensure(100 + compartment.lines.length * 42);
    writer.heading(compartment.title);
    writer.bullets(compartment.lines);
  }
}

function drawCutList(writer, plan) {
  writer.newPage(plan.pageTitles.cutList);
  writer.paragraph(plan.units, { size: 22, color: C.muted });
  const fractions = [0.30, 0.07, 0.10, 0.10, 0.09, 0.34];
  const widths = fractions.map((f) => f * writer.contentWidth);
  const columnX = (i) => {
    const before = widths.slice(0, i).reduce((a, b) => a + b, 0);
    return writer.rtl ? PAGE.width - PAGE.margin - before - 14 : PAGE.margin + before + 14;
  };
  let zebra = false;
  const drawRow = (cells, { header = false } = {}) => {
    font(writer.ctx, header ? 20 : 22, header ? 700 : 400);
    const cellLines = cells.map((cell, i) => wrap(writer.ctx, cell, widths[i] - 24));
    const height = Math.max(...cellLines.map((l) => l.length)) * 30 + 20;
    const before = writer.pages.length;
    writer.ensure(height + 10);
    if (writer.pages.length !== before && !header) drawRow(plan.cutHeaders, { header: true }); // repeat header
    const c = writer.ctx;
    if (header) roundRect(c, PAGE.margin, writer.y, writer.contentWidth, height, 12, { fill: C.primary });
    else if (zebra) { c.fillStyle = C.containerLow; c.fillRect(PAGE.margin, writer.y, writer.contentWidth, height); }
    cellLines.forEach((lines, i) => {
      // Numbers and Latin names keep their left-to-right order, right-aligned on RTL pages.
      textStyle(c, {
        size: header ? 20 : 22, weight: header ? 700 : 400, color: header ? '#ffffff' : C.ink,
        rtl: writer.rtl && HEBREW.test(cells[i]), align: writer.rtl ? 'right' : 'left',
      });
      lines.forEach((line, li) => c.fillText(line, columnX(i), writer.y + 10 + li * 30));
    });
    writer.y += height;
    if (!header) zebra = !zebra;
  };
  drawRow(plan.cutHeaders, { header: true });
  const dash = (v) => (v == null ? '—' : String(v));
  plan.cutList.forEach((r) => drawRow([r.part, String(r.qty), dash(r.length), dash(r.width), dash(r.thickness), r.material]));
  writer.y += 30;
  writer.heading(plan.assumptionsTitle);
  writer.bullets(plan.assumptions);
}

function drawSteps(writer, plan) {
  writer.newPage(plan.pageTitles.steps);
  writer.numbered(plan.steps);
  writer.heading(plan.notSpecifiedTitle);
  writer.bullets(plan.notSpecified);
}

/** Disclaimer box and page number on every page, drawn once the page count is known. */
function drawFooters(writer, plan) {
  const total = writer.pages.length;
  writer.pages.forEach(({ ctx }, i) => {
    const w = PAGE.width - 2 * PAGE.margin;
    roundRect(ctx, PAGE.margin, FOOTER_TOP, w, 86, 14, { fill: C.container, stroke: C.primary, lineWidth: 1.5 });
    textStyle(ctx, { size: 19, weight: 600, color: C.primaryDark, rtl: writer.rtl, align: 'center' });
    const lines = wrap(ctx, plan.disclaimer, w - 48).slice(0, 2);
    const offset = lines.length === 1 ? 30 : 15;
    lines.forEach((line, li) => ctx.fillText(line, PAGE.width / 2, FOOTER_TOP + offset + li * 28));
    textStyle(ctx, { size: 18, weight: 500, color: C.muted, rtl: writer.rtl, align: 'center' });
    ctx.fillText(`BanAI · ${plan.pageOf(i + 1, total)}`, PAGE.width / 2, FOOTER_TOP + 108);
  });
  // The title block on sheet 1 shows "1 / total".
  if (writer.sheetCell) {
    const { ctx } = writer.pages[0];
    textStyle(ctx, { size: 25, weight: 700, color: C.ink, align: writer.rtl ? 'right' : 'left' });
    ctx.fillText(`1 / ${total}`, writer.sheetCell.x, writer.sheetCell.y);
  }
}

/** Render the plan into A4 page canvases. `snapshot` is a data URL of the 3D view (optional). */
export async function renderPages(plan, { snapshot = null, date = new Date() } = {}) {
  await document.fonts?.ready;
  const assets = {
    logo: await logoImage(),
    snapshot: snapshot ? await loadImage(snapshot) : null,
    dateText: date.toLocaleDateString(plan.language === 'he' ? 'he-IL' : 'en-GB'),
  };
  const writer = createWriter(plan, assets);
  drawSheet(writer, plan, assets);
  drawDetails(writer, plan);
  drawCutList(writer, plan);
  drawSteps(writer, plan);
  drawFooters(writer, plan);
  return writer.pages.map((page) => page.canvas);
}
