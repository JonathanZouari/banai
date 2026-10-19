// Draws the carpenter plan onto A4 canvases (150 dpi). Browser only. The browser lays out the
// text, so Hebrew (RTL) and its fonts work without embedding anything in the PDF. Text is drawn
// with fillText, never parsed as markup, so custom names are always plain data.

export const PAGE = Object.freeze({ width: 1240, height: 1754, margin: 90 });
const FONT = "'DM Sans', Arial, 'Segoe UI', 'Noto Sans Hebrew', sans-serif";
const COLORS = Object.freeze({
  ink: '#1d1f1e', muted: '#5d625f', line: '#c9ccc8', fill: '#f2f1ed', panel: '#d9d4c7',
  accent: '#3d5a4c', drawer: '#e6e1d6', warn: '#8a3b12', warnFill: '#fbeee6',
});
const FOOTER_SPACE = 150;
const CONTENT_BOTTOM = PAGE.height - PAGE.margin - FOOTER_SPACE;

function createPage() {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.width;
  canvas.height = PAGE.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE.width, PAGE.height);
  return { canvas, ctx };
}

function font(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
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

/** A flowing writer: keeps a y cursor and starts a new page when content would overflow. */
function createWriter(plan) {
  const rtl = plan.dir === 'rtl';
  const pages = [];
  let page;
  let y;
  const start = rtl ? PAGE.width - PAGE.margin : PAGE.margin;
  const contentWidth = PAGE.width - 2 * PAGE.margin;

  const setText = (size, weight, color) => {
    font(page.ctx, size, weight);
    page.ctx.fillStyle = color;
    page.ctx.direction = rtl ? 'rtl' : 'ltr';
    page.ctx.textAlign = rtl ? 'right' : 'left';
    page.ctx.textBaseline = 'top';
  };

  const writer = {
    rtl,
    pages,
    get ctx() { return page.ctx; },
    get y() { return y; },
    set y(value) { y = value; },
    contentWidth,
    newPage(title) {
      page = createPage();
      pages.push(page);
      y = PAGE.margin;
      setText(22, 600, COLORS.muted);
      page.ctx.fillText(plan.title, start, y);
      y += 40;
      if (title) {
        setText(40, 700, COLORS.ink);
        page.ctx.fillText(title, start, y);
        y += 64;
      }
      page.ctx.strokeStyle = COLORS.line;
      page.ctx.lineWidth = 2;
      page.ctx.beginPath();
      page.ctx.moveTo(PAGE.margin, y);
      page.ctx.lineTo(PAGE.width - PAGE.margin, y);
      page.ctx.stroke();
      y += 30;
    },
    ensure(height, title) {
      if (y + height > CONTENT_BOTTOM) writer.newPage(title);
    },
    paragraph(text, { size = 26, weight = 400, color = COLORS.ink, indent = 0, gap = 14, title } = {}) {
      setText(size, weight, color);
      const lines = wrap(page.ctx, text, contentWidth - indent);
      const lineHeight = Math.round(size * 1.4);
      for (const line of lines) {
        writer.ensure(lineHeight, title);
        setText(size, weight, color);
        page.ctx.fillText(line, rtl ? start - indent : start + indent, y);
        y += lineHeight;
      }
      y += gap;
    },
    heading(text, title) {
      writer.ensure(90, title);
      y += 10;
      writer.paragraph(text, { size: 30, weight: 700, color: COLORS.accent, gap: 10, title });
    },
    /** Two-column label / value rows. */
    keyValues(rows, title) {
      const labelWidth = contentWidth * 0.45;
      for (const { label, value } of rows) {
        writer.ensure(44, title);
        setText(25, 600, COLORS.muted);
        page.ctx.fillText(label, start, y);
        setText(25, 500, COLORS.ink);
        const valueX = rtl ? start - labelWidth : start + labelWidth;
        const lines = wrap(page.ctx, value, contentWidth - labelWidth);
        lines.forEach((line, i) => page.ctx.fillText(line, valueX, y + i * 34));
        y += Math.max(1, lines.length) * 34 + 10;
      }
    },
    numbered(items, title) {
      items.forEach((item, i) => {
        writer.ensure(40, title);
        setText(26, 700, COLORS.accent);
        page.ctx.fillText(`${i + 1}.`, start, y);
        writer.paragraph(item, { indent: 56, gap: 12, title });
      });
    },
    bullets(items, title) {
      items.forEach((item) => {
        writer.ensure(40, title);
        setText(26, 700, COLORS.accent);
        page.ctx.fillText('•', start, y);
        writer.paragraph(item, { indent: 36, gap: 6, title });
      });
    },
  };
  return writer;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('snapshot could not be loaded'));
    image.src = src;
  });
}

async function drawCover(writer, plan, snapshot, dateText) {
  writer.newPage(plan.pageTitles.cover);
  writer.paragraph(`${plan.subtitle} · ${dateText}`, { size: 24, color: COLORS.muted });
  if (snapshot) {
    const image = await loadImage(snapshot);
    const maxW = writer.contentWidth;
    const maxH = 720;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const x = (PAGE.width - w) / 2;
    writer.ctx.drawImage(image, x, writer.y, w, h);
    writer.ctx.strokeStyle = COLORS.line;
    writer.ctx.lineWidth = 2;
    writer.ctx.strokeRect(x, writer.y, w, h);
    writer.y += h + 12;
    writer.paragraph(plan.illustration, { size: 21, color: COLORS.muted });
  }
  writer.paragraph(plan.units, { size: 22, color: COLORS.muted });
  writer.keyValues(plan.overview, plan.pageTitles.cover);
  for (const compartment of plan.compartments) {
    // Keep a compartment's heading together with its lines.
    writer.ensure(100 + compartment.lines.length * 42, plan.pageTitles.cover);
    writer.heading(compartment.title, plan.pageTitles.cover);
    writer.bullets(compartment.lines, plan.pageTitles.cover);
  }
}

/** Horizontal or vertical dimension line with end ticks and a centred value. */
function dimension(ctx, x0, y0, x1, y1, label) {
  ctx.strokeStyle = COLORS.muted;
  ctx.fillStyle = COLORS.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  const vertical = x0 === x1;
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    if (vertical) { ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); } else { ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); }
  }
  ctx.stroke();
  font(ctx, 20, 600);
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  ctx.save();
  ctx.translate(mx, my);
  if (vertical) ctx.rotate(-Math.PI / 2);
  const width = ctx.measureText(label).width + 12;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-width / 2, -13, width, 26);
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawElevation(writer, plan) {
  writer.newPage(plan.pageTitles.drawing);
  const { drawing } = plan;
  const ctx = writer.ctx;
  const top = writer.y + 50;
  const boxW = writer.contentWidth - 120;
  const boxH = CONTENT_BOTTOM - top - 90;
  const scale = Math.min(boxW / drawing.width, boxH / drawing.height);
  const left = PAGE.margin + 90 + (boxW - drawing.width * scale) / 2;
  const X = (mm) => left + mm * scale;
  const Y = (mm) => top + (drawing.height - mm) * scale; // y from the floor, up
  const rect = (x0, y0, x1, y1, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(X(x0), Y(y1), (x1 - x0) * scale, (y1 - y0) * scale);
    ctx.strokeRect(X(x0), Y(y1), (x1 - x0) * scale, (y1 - y0) * scale);
  };
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1.5;
  const { width, height, panel } = drawing;
  rect(0, 0, width, height, COLORS.fill);
  rect(0, 0, panel, height, COLORS.panel);
  rect(width - panel, 0, width, height, COLORS.panel);
  rect(panel, 0, width - panel, panel, COLORS.panel);
  rect(panel, height - panel, width - panel, height, COLORS.panel);
  drawing.partitions.forEach((p) => rect(p.x, panel, p.x + p.thickness, height - panel, COLORS.panel));
  for (const c of drawing.compartments) {
    c.shelves.forEach((s) => rect(c.x0, s.y, c.x1, s.y + s.thickness, COLORS.panel));
    c.drawers.forEach((d) => {
      rect(c.x0 + 3, d.y + 3, c.x1 - 3, d.y + d.height - 3, COLORS.drawer);
      ctx.beginPath();
      ctx.moveTo(X((c.x0 + c.x1) / 2 - 40), Y(d.y + d.height / 2));
      ctx.lineTo(X((c.x0 + c.x1) / 2 + 40), Y(d.y + d.height / 2));
      ctx.stroke();
    });
    c.rails.forEach((r) => {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.muted;
      ctx.beginPath();
      ctx.moveTo(X(c.x0), Y(r.y));
      ctx.lineTo(X(c.x1), Y(r.y));
      ctx.stroke();
      ctx.restore();
    });
    // Item heights (mm above the bottom panel's top face), next to the item.
    font(ctx, 17, 500);
    ctx.fillStyle = COLORS.accent;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    c.shelves.forEach((s) => ctx.fillText(String(s.y - panel), X(c.x0) + 6, Y(s.y + s.thickness) - 3));
    c.rails.forEach((r) => ctx.fillText(String(r.y - panel), X(c.x0) + 6, Y(r.y) - 6));
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
  }
  // Dimension lines: overall width above, overall height at the left, compartment widths below.
  dimension(ctx, X(0), top - 30, X(width), top - 30, String(width));
  dimension(ctx, X(0) - 40, Y(0), X(0) - 40, Y(height), String(height));
  drawing.compartments.forEach((c) => dimension(ctx, X(c.x0), Y(0) + 32, X(c.x1), Y(0) + 32, String(c.width)));
  writer.y = Y(0) + 70;
}

function drawCutList(writer, plan) {
  const title = plan.pageTitles.cutList;
  writer.newPage(title);
  writer.paragraph(plan.units, { size: 22, color: COLORS.muted });
  // Column widths as fractions of the content width; laid out from the start side.
  const fractions = [0.30, 0.07, 0.10, 0.10, 0.09, 0.34];
  const widths = fractions.map((f) => f * writer.contentWidth);
  const columnX = (i) => {
    const before = widths.slice(0, i).reduce((a, b) => a + b, 0);
    return writer.rtl ? PAGE.width - PAGE.margin - before - 8 : PAGE.margin + before + 8;
  };
  const drawRow = (cells, { header = false } = {}) => {
    const ctx = writer.ctx;
    font(ctx, header ? 21 : 22, header ? 700 : 400);
    const cellLines = cells.map((cell, i) => wrap(ctx, cell, widths[i] - 16));
    const height = Math.max(...cellLines.map((l) => l.length)) * 30 + 16;
    writer.ensure(height + 10, title);
    const c = writer.ctx;
    if (header) {
      c.fillStyle = COLORS.fill;
      c.fillRect(PAGE.margin, writer.y, writer.contentWidth, height);
    }
    font(c, header ? 21 : 22, header ? 700 : 400);
    c.fillStyle = COLORS.ink;
    c.direction = writer.rtl ? 'rtl' : 'ltr';
    c.textAlign = writer.rtl ? 'right' : 'left';
    c.textBaseline = 'top';
    cellLines.forEach((lines, i) => lines.forEach((line, li) => c.fillText(line, columnX(i), writer.y + 8 + li * 30)));
    writer.y += height;
    c.strokeStyle = COLORS.line;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(PAGE.margin, writer.y);
    c.lineTo(PAGE.width - PAGE.margin, writer.y);
    c.stroke();
  };
  drawRow(plan.cutHeaders, { header: true });
  const dash = (v) => (v == null ? '—' : String(v));
  plan.cutList.forEach((r) => drawRow([r.part, String(r.qty), dash(r.length), dash(r.width), dash(r.thickness), r.material]));
  writer.y += 24;
  writer.heading(plan.assumptionsTitle, title);
  writer.bullets(plan.assumptions, title);
}

function drawSteps(writer, plan) {
  const title = plan.pageTitles.steps;
  writer.newPage(title);
  writer.numbered(plan.steps, title);
  writer.heading(plan.notSpecifiedTitle, title);
  writer.bullets(plan.notSpecified, title);
}

/** Disclaimer box and page number on every page, drawn once the page count is known. */
function drawFooters(writer, plan) {
  const total = writer.pages.length;
  writer.pages.forEach(({ ctx }, i) => {
    const top = PAGE.height - PAGE.margin - FOOTER_SPACE + 30;
    ctx.fillStyle = COLORS.warnFill;
    ctx.fillRect(PAGE.margin, top, PAGE.width - 2 * PAGE.margin, 82);
    ctx.strokeStyle = COLORS.warn;
    ctx.lineWidth = 2;
    ctx.strokeRect(PAGE.margin, top, PAGE.width - 2 * PAGE.margin, 82);
    font(ctx, 20, 600);
    ctx.fillStyle = COLORS.warn;
    ctx.direction = writer.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    wrap(ctx, plan.disclaimer, PAGE.width - 2 * PAGE.margin - 40)
      .slice(0, 2)
      .forEach((line, li) => ctx.fillText(line, PAGE.width / 2, top + 12 + li * 30));
    font(ctx, 19, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(plan.pageOf(i + 1, total), PAGE.width / 2, top + 100);
  });
}

/** Render the plan into A4 page canvases. `snapshot` is a data URL of the 3D view (optional). */
export async function renderPages(plan, { snapshot = null, date = new Date() } = {}) {
  const dateText = date.toLocaleDateString(plan.language === 'he' ? 'he-IL' : 'en-GB');
  const writer = createWriter(plan);
  await drawCover(writer, plan, snapshot, dateText);
  drawElevation(writer, plan);
  drawCutList(writer, plan);
  drawSteps(writer, plan);
  drawFooters(writer, plan);
  return writer.pages.map((page) => page.canvas);
}
