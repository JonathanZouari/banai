// Vector shop drawings for the dossier, generated from the layout (never from a screenshot).
// Units are millimetres in the drawing's own coordinates; viewBox scaling fits the page.
import { PANEL, PLINTH, DOOR_GAP } from '../../p1-workspace/js/model.js';
import { board, SHEET } from './production.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const k of kids) n.append(k);
  return n;
};
const txt = (x, y, str, attrs = {}) => s('text', { x, y, ...attrs }, String(str));
const r1 = (v) => Math.round(v);

const WOOD_TINT = { oak: '#c49a6c', light_oak: '#d6bd96', walnut: '#6e4c34' };
const tint = (id) => WOOD_TINT[id] ?? board(id).color ?? '#eeeeee';

function defs(fs) {
  return s('defs', {},
    s('pattern', { id: 'hatch', width: fs * 0.55, height: fs * 0.55, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      s('line', { x1: 0, y1: 0, x2: 0, y2: fs * 0.55, class: 'hatch-line' })),
    s('pattern', { id: 'glass', width: fs * 1.6, height: fs * 1.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-35)' },
      s('line', { x1: 0, y1: 0, x2: 0, y2: fs * 0.7, class: 'glass-line' })),
    s('marker', { id: 'tick', viewBox: '-5 -5 10 10', markerWidth: 6, markerHeight: 6, orient: 'auto' },
      s('line', { x1: -3, y1: 3, x2: 3, y2: -3, class: 'tick' })));
}

/** Dimension line between two points (drawing coords), text offset to `side`. */
function dim(g, x1, y1, x2, y2, label, fs, { offset = 0, ext = true } = {}) {
  const horizontal = Math.abs(y2 - y1) < 1e-6;
  const grp = s('g', { class: 'dim' });
  if (horizontal) {
    const y = y1 + offset;
    if (ext && offset) {
      grp.append(s('line', { x1, y1, x2: x1, y2: y + Math.sign(offset) * fs * 0.3, class: 'ext' }));
      grp.append(s('line', { x1: x2, y1, x2, y2: y + Math.sign(offset) * fs * 0.3, class: 'ext' }));
    }
    grp.append(s('line', { x1, y1: y, x2, y2: y, 'marker-start': 'url(#tick)', 'marker-end': 'url(#tick)' }));
    grp.append(txt((x1 + x2) / 2, y - fs * 0.35, label, { 'font-size': fs, class: 'dim-text', direction: 'ltr' }));
  } else {
    const x = x1 + offset;
    if (ext && offset) {
      grp.append(s('line', { x1, y1, x2: x + Math.sign(offset) * fs * 0.3, y2: y1, class: 'ext' }));
      grp.append(s('line', { x1: x2, y1: y2, x2: x + Math.sign(offset) * fs * 0.3, y2, class: 'ext' }));
    }
    grp.append(s('line', { x1: x, y1, x2: x, y2, 'marker-start': 'url(#tick)', 'marker-end': 'url(#tick)' }));
    const ty = (y1 + y2) / 2;
    grp.append(txt(x - fs * 0.35, ty, label, { 'font-size': fs, class: 'dim-text', direction: 'ltr', transform: `rotate(-90 ${x - fs * 0.35} ${ty})` }));
  }
  g.append(grp);
}

function frame(minX, minY, w, h, fs) {
  const svg = s('svg', { viewBox: `${minX} ${minY} ${w} ${h}`, class: 'drawing', preserveAspectRatio: 'xMidYMid meet' });
  svg.append(defs(fs));
  return svg;
}

// ---------- elevations ----------
export function frontElevation(state, L) {
  const { W, H } = L;
  const niche = state.site.niche;
  const ceil = state.site.ceiling;
  const gap = Math.max(0, (niche - W) / 2);
  const fs = Math.max(W, ceil) / 38;
  const wall = 140;
  const svg = frame(-gap - wall - fs * 4, -(ceil + fs * 5), W + 2 * (gap + wall) + fs * 8, ceil + fs * 10, fs);
  const g = s('g', { transform: 'scale(1,-1)' });
  svg.append(g);
  // Floor, niche walls, ceiling line.
  g.append(s('rect', { x: -gap - wall - fs * 2, y: -fs * 0.9, width: W + 2 * (gap + wall) + fs * 4, height: fs * 0.9, fill: 'url(#hatch)', class: 'cut' }));
  g.append(s('line', { x1: -gap - wall - fs * 2, y1: 0, x2: W + gap + wall + fs * 2, y2: 0, class: 'ln-heavy' }));
  if (niche - W <= 400) {
    for (const x of [-gap - wall, W + gap]) g.append(s('rect', { x, y: 0, width: wall, height: ceil, fill: 'url(#hatch)', class: 'cut' }));
  }
  g.append(s('line', { x1: -gap, y1: ceil, x2: W + gap, y2: ceil, class: 'ln-dash' }));

  // Carcass silhouette and plinth.
  g.append(s('rect', { x: 0, y: 0, width: W, height: H, class: 'body' }));
  g.append(s('rect', { x: PANEL, y: 0, width: W - 2 * PANEL, height: PLINTH - 4, class: 'recess' }));
  const fill = tint(state.decor.front);
  if (state.doors.type === 'hinged') {
    for (const d of L.doors) {
      const y0 = PLINTH + DOOR_GAP / 2;
      g.append(s('rect', { x: d.x0, y: y0, width: d.w, height: d.h, class: 'front', fill }));
      if (d.mirror) g.append(s('rect', { x: d.x0 + 35, y: y0 + 35, width: d.w - 70, height: d.h - 70, fill: 'url(#glass)', class: 'mirror' }));
      // Opening convention: lines from the handle edge corners to the middle of the hinge edge.
      const hx = d.hinge === 'left' ? d.x0 : d.x0 + d.w;
      const ox = d.hinge === 'left' ? d.x0 + d.w : d.x0;
      g.append(s('polyline', { points: `${ox},${y0} ${hx},${y0 + d.h / 2} ${ox},${y0 + d.h}`, class: 'ln-swing' }));
      if (state.doors.handle === 'bar') {
        const hxh = d.hinge === 'left' ? d.x0 + d.w - 42 : d.x0 + 42;
        g.append(s('rect', { x: hxh - 7, y: 1050 - 170, width: 14, height: 340, rx: 7, class: 'handle' }));
      } else if (state.doors.handle === 'edge') {
        g.append(s('rect', { x: (d.hinge === 'left' ? d.x0 + d.w - 14 : d.x0), y: y0, width: 14, height: d.h, class: 'handle' }));
      }
    }
  } else if (L.sliding) {
    const y0 = PLINTH + PANEL + 12;
    const h = H - PANEL - 40 - y0 - 4;
    const back = L.doors.filter((d) => d.track === 'back');
    const frontP = L.doors.filter((d) => d.track === 'front');
    for (const d of [...back, ...frontP]) {
      g.append(s('rect', { x: d.x0, y: y0, width: d.w, height: h, class: d.track === 'front' ? 'front front--near' : 'front', fill }));
      if (d.mirror) g.append(s('rect', { x: d.x0 + 35, y: y0 + 35, width: d.w - 70, height: h - 70, fill: 'url(#glass)', class: 'mirror' }));
    }
    g.append(s('rect', { x: PANEL, y: H - PANEL - 40, width: W - 2 * PANEL, height: 40, class: 'track' }));
  } else {
    g.append(interiorGroup(state, L, fs));
  }

  const t = s('g', {}); // screen coordinates: up is negative
  svg.append(t);
  // Dimensions in screen coordinates (y down).
  dim(t, 0, 0, W, 0, `${r1(W)}`, fs, { offset: fs * 2.6 });
  if (state.doors.type === 'hinged') {
    const chain = [0, ...L.doors.map((d) => d.x0 + d.w + DOOR_GAP / 2)];
    for (let i = 0; i < L.doors.length; i++) dim(t, chain[i], -H, chain[i + 1], -H, `${r1(L.doors[i].w)}`, fs * 0.8, { offset: -fs * 1.6 });
  }
  dim(t, W, 0, W, -H, `${r1(H)}`, fs, { offset: fs * 2.2 });
  dim(t, 0, 0, 0, -PLINTH, `${PLINTH}`, fs * 0.75, { offset: -fs * 1.4 });
  if (ceil > H) dim(t, W, -H, W, -ceil, `${r1(ceil - H)}`, fs * 0.75, { offset: fs * 2.2 });
  t.append(txt(-gap + fs * 3.2, -ceil - fs * 0.45, `תקרה ${r1(ceil)}`, { 'font-size': fs * 0.8, class: 'note' }));
  if (gap > 0 && niche - W <= 400) dim(t, -gap, -ceil * 0.42, 0, -ceil * 0.42, `${r1(gap)}`, fs * 0.7, { offset: 0, ext: false });
  return svg;
}

function interiorGroup(state, L, fs) {
  const g = s('g', {});
  const { W, H } = L;
  const y0 = PLINTH + PANEL;
  g.append(s('rect', { x: 0, y: 0, width: W, height: H, class: 'body' }));
  g.append(s('rect', { x: PANEL, y: y0, width: W - 2 * PANEL, height: L.interiorH, class: 'inside' }));
  for (const c of L.comps) {
    if (c.index < L.n - 1) g.append(s('rect', { x: c.x0 + c.w, y: y0, width: PANEL, height: L.interiorH, class: 'body' }));
    for (const sy of c.shelves) g.append(s('rect', { x: c.x0, y: y0 + sy, width: c.w, height: PANEL, class: 'shelf' }));
    c.rails.forEach((ry, i) => {
      const y = y0 + ry;
      g.append(s('line', { x1: c.x0 + 20, y1: y, x2: c.x0 + c.w - 20, y2: y, class: 'rail' }));
      const zoneTop = y - 40;
      const isUpper = c.preset === 'double' && i === 0;
      const floorOf = c.preset === 'double' && isUpper ? y0 + c.shelves[1] + PANEL : y0;
      g.append(s('rect', { x: c.x0 + c.w * 0.18, y: floorOf + 40, width: c.w * 0.64, height: Math.max(0, zoneTop - floorOf - 40), class: 'zone' }));
    });
    for (const dr of c.drawers) {
      g.append(s('rect', { x: c.x0 + 2, y: y0 + dr.y + 3, width: c.w - 4, height: dr.h, class: 'drawer' }));
      g.append(s('line', { x1: c.x0 + c.w / 2 - 64, y1: y0 + dr.y + dr.h * 0.72, x2: c.x0 + c.w / 2 + 64, y2: y0 + dr.y + dr.h * 0.72, class: 'handle-line' }));
    }
    // Inserts: sloped shoe tiers, the trouser-rack zone, the pull-down rail and the LED strip.
    for (const t of c.shoes ?? []) {
      const y = y0 + t.y + 90;
      g.append(s('line', { x1: c.x0 + 6, y1: y + 40, x2: c.x0 + c.w - 6, y2: y + 40, class: 'shelf-line' }));
      g.append(s('line', { x1: c.x0 + 6, y1: y + 4, x2: c.x0 + c.w - 6, y2: y + 4, class: 'rail rail--thin' }));
    }
    if (c.trousers) {
      g.append(s('rect', { x: c.x0 + 24, y: y0 + 40, width: c.w - 48, height: c.trousers.h - 80, class: 'zone' }));
      g.append(s('line', { x1: c.x0 + 30, y1: y0 + c.trousers.y, x2: c.x0 + c.w - 30, y2: y0 + c.trousers.y, class: 'rail rail--thin' }));
    }
    if (c.pulldown) {
      const y = y0 + c.pulldown.y;
      g.append(s('line', { x1: c.x0 + 30, y1: y, x2: c.x0 + c.w - 30, y2: y, class: 'rail' }));
      g.append(s('line', { x1: c.x0 + c.w / 2, y1: y, x2: c.x0 + c.w / 2, y2: y - 420, class: 'ln-thin' }));
    }
    if (c.led) g.append(s('line', { x1: c.x0 + 20, y1: L.H - PANEL - 8, x2: c.x0 + c.w - 20, y2: L.H - PANEL - 8, class: 'led' }));
  }
  return g;
}

export function interiorElevation(state, L) {
  const { W, H } = L;
  const fs = Math.max(W, H) / 40;
  const svg = frame(-fs * 4, -(H + fs * 5), W + fs * 8, H + fs * 9, fs);
  const g = s('g', { transform: 'scale(1,-1)' });
  svg.append(g);
  g.append(s('line', { x1: -fs * 2, y1: 0, x2: W + fs * 2, y2: 0, class: 'ln-heavy' }));
  g.append(interiorGroup(state, L, fs));
  const t = s('g', {}); // screen coordinates: up is negative
  svg.append(t);
  const chain = [PANEL, ...L.comps.map((c) => c.x0 + c.w)];
  L.comps.forEach((c, i) => {
    dim(t, chain[i] + (i ? PANEL : 0), -H, c.x0 + c.w, -H, `${r1(c.w)}`, fs * 0.8, { offset: -fs * 1.6 });
    t.append(txt(c.x0 + c.w / 2, -(PLINTH + PANEL + L.interiorH / 2), `${i + 1}`, { 'font-size': fs * 1.6, class: 'comp-no' }));
  });
  dim(t, 0, 0, W, 0, `${r1(W)}`, fs, { offset: fs * 2.4 });
  dim(t, W, 0, W, -H, `${r1(H)}`, fs, { offset: fs * 2.2 });
  return svg;
}

/** One compartment, with a vertical dimension chain measured from the floor. */
export function compartmentElevation(state, L, c) {
  const H = L.H;
  const fs = H / 26;
  const pad = fs * 6;
  const svg = frame(c.x0 - PANEL - fs * 1.5, -(H + fs * 2.4), c.w + 2 * PANEL + pad + fs * 3, H + fs * 4.4, fs);
  const g = s('g', { transform: 'scale(1,-1)' });
  svg.append(g);
  const y0 = PLINTH + PANEL;
  g.append(s('line', { x1: c.x0 - PANEL - fs, y1: 0, x2: c.x0 + c.w + PANEL + fs, y2: 0, class: 'ln-heavy' }));
  g.append(s('rect', { x: c.x0 - PANEL, y: 0, width: c.w + 2 * PANEL, height: H, class: 'body' }));
  g.append(s('rect', { x: c.x0, y: y0, width: c.w, height: L.interiorH, class: 'inside' }));
  const sub = { ...L, comps: [c], n: 1, W: L.W };
  const inner = interiorGroup(state, sub, fs);
  [...inner.children].slice(2).forEach((n) => g.append(n));
  const t = s('g', {}); // screen coordinates: up is negative
  svg.append(t);
  const marks = [0, y0, ...c.shelves.map((sy) => y0 + sy + PANEL), ...c.rails.map((ry) => y0 + ry), ...c.drawers.map((dr) => y0 + dr.y + dr.h + 3), H - PANEL];
  const ys = [...new Set(marks.map(r1))].sort((a, b) => a - b);
  const x = c.x0 + c.w + PANEL;
  for (let i = 1; i < ys.length; i++) dim(t, x, -ys[i - 1], x, -ys[i], `${ys[i] - ys[i - 1]}`, fs * 0.7, { offset: fs * 1.4 });
  dim(t, x, 0, x, -H, `${r1(H)}`, fs * 0.8, { offset: fs * 3.8 });
  dim(t, c.x0, 0, c.x0 + c.w, 0, `${r1(c.w)}`, fs * 0.8, { offset: fs * 1.6 });
  return svg;
}

// ---------- plan ----------
export function planView(state, L) {
  const { W, D } = L;
  const niche = state.site.niche;
  const gap = Math.max(0, (niche - W) / 2);
  const maxDoor = state.doors.type === 'hinged' ? Math.max(...L.doors.map((d) => d.w)) : 0;
  const fs = W / 40;
  const wall = 140;
  const depthOut = D + Math.max(maxDoor, 300) + fs * 2;
  const svg = frame(-gap - wall - fs * 3, -wall - fs * 2, W + 2 * (gap + wall) + fs * 6, depthOut + wall + fs * 6, fs);
  // Back wall and niche walls (cut, hatched).
  svg.append(s('rect', { x: -gap - wall, y: -wall, width: W + 2 * (gap + wall), height: wall, fill: 'url(#hatch)', class: 'cut' }));
  if (niche - W <= 400) for (const x of [-gap - wall, W + gap]) svg.append(s('rect', { x, y: 0, width: wall, height: D + 180, fill: 'url(#hatch)', class: 'cut' }));
  // Carcass.
  svg.append(s('rect', { x: 0, y: 0, width: PANEL, height: D, class: 'body' }));
  svg.append(s('rect', { x: W - PANEL, y: 0, width: PANEL, height: D, class: 'body' }));
  svg.append(s('line', { x1: PANEL, y1: 8, x2: W - PANEL, y2: 8, class: 'ln-thin' }));
  for (const c of L.comps.slice(0, -1)) svg.append(s('rect', { x: c.x0 + c.w, y: 13, width: PANEL, height: D - 30, class: 'body' }));
  for (const c of L.comps) {
    if (c.rails.length) svg.append(s('line', { x1: c.x0 + 20, y1: 13 + (L.shelfDepth - 13) / 2, x2: c.x0 + c.w - 20, y2: 13 + (L.shelfDepth - 13) / 2, class: 'rail' }));
  }
  const fill = tint(state.decor.front);
  if (state.doors.type === 'hinged') {
    for (const d of L.doors) {
      const left = d.hinge === 'left';
      const hx = left ? d.x0 : d.x0 + d.w;
      const z = D + 1;
      svg.append(s('rect', { x: d.x0, y: z, width: d.w, height: PANEL, class: 'front front--ghost', fill }));
      // Open leaf at 90° and the swing arc.
      svg.append(s('rect', { x: left ? hx : hx - PANEL, y: z, width: PANEL, height: d.w, class: 'front', fill }));
      const ex = left ? d.x0 + d.w : d.x0;
      svg.append(s('path', { d: `M ${ex} ${z} A ${d.w} ${d.w} 0 0 ${left ? 1 : 0} ${hx} ${z + d.w}`, class: 'ln-swing' }));
    }
  } else if (L.sliding) {
    for (const d of L.doors) {
      const z = d.track === 'front' ? D - 30 : D - 60;
      svg.append(s('rect', { x: d.x0, y: z, width: d.w, height: 18, class: 'front', fill }));
    }
  }
  dim(svg, 0, 0, W, 0, `${r1(W)}`, fs, { offset: -fs * 0.8 - wall });
  dim(svg, W, 0, W, D, `${r1(D)}`, fs, { offset: gap + wall + fs * 1.6 });
  if (maxDoor) {
    svg.append(s('line', { x1: -gap, y1: D + P2 + maxDoor, x2: W + gap, y2: D + P2 + maxDoor, class: 'ln-dash' }));
    dim(svg, -gap, D, -gap, D + maxDoor, `${r1(maxDoor)}`, fs * 0.8, { offset: -fs * 1.6 });
    svg.append(txt(W / 2, D + maxDoor + fs * 1.6, `מרחב פתיחה נדרש מול הארון: ${r1(maxDoor)} מ״מ`, { 'font-size': fs * 0.8, class: 'note' }));
  }
  return svg;
}
const P2 = PANEL;

// ---------- exploded isometric ----------
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const iso = ([x, y, z]) => [(x - z) * C30, (x + z) * S30 - y];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `rgb(${c.join(',')})`;
}

export function explodedView(prod, L, { magnitude = 420 } = {}) {
  const items = [];
  for (const r of prod.rows) {
    r.boxes.forEach((b, i) => {
      const off = b.explode.map((v) => v * magnitude);
      const min = b.min.map((v, k) => v + off[k]);
      const max = b.max.map((v, k) => v + off[k]);
      items.push({ r, i, min, max, key: (min[0] + max[0]) / 2 + (min[1] + max[1]) / 2 + (min[2] + max[2]) / 2 });
    });
  }
  items.sort((a, b) => a.key - b.key);
  const polys = [];
  let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity;
  for (const it of items) {
    const [x0, y0, z0] = it.min;
    const [x1, y1, z1] = it.max;
    const faces = [
      { pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], k: 1.06 },
      { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], k: 0.96 },
      { pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], k: 0.8 },
    ].map((f) => ({ ...f, p: f.pts.map(iso) }));
    for (const f of faces) for (const [px, py] of f.p) { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); }
    polys.push({ it, faces });
  }
  const fs = (bx1 - bx0) / 52;
  const pad = fs * 3;
  const svg = frame(bx0 - pad, by0 - pad, bx1 - bx0 + 2 * pad, by1 - by0 + 2 * pad, fs);
  const labelled = new Set();
  const labels = [];
  for (const { it, faces } of polys) {
    const base = tint(it.r.decor);
    const g = s('g', { class: 'iso-part' });
    for (const f of faces) g.append(s('polygon', { points: f.p.map((p) => p.join(',')).join(' '), fill: shade(base, f.k), class: 'iso-face' }));
    svg.append(g);
    if (!labelled.has(it.r.no)) {
      labelled.add(it.r.no);
      const size = it.max.map((v, k) => v - it.min[k]);
      const thin = size.indexOf(Math.min(...size));
      const f = (thin === 2 ? faces[1] : thin === 0 ? faces[2] : faces[0]).p;
      const cx = f.reduce((a, p) => a + p[0], 0) / 4;
      const cy = f.reduce((a, p) => a + p[1], 0) / 4;
      labels.push([cx, cy, it.r.no]);
    }
  }
  for (const [cx, cy, no] of labels) {
    svg.append(s('circle', { cx, cy, r: fs * 0.95, class: 'balloon' }));
    svg.append(txt(cx, cy + fs * 0.36, no, { 'font-size': fs * 1.05, class: 'balloon-text' }));
  }
  return svg;
}

// ---------- sheet layouts ----------
export function sheetDrawing(sheet, rowsByNo) {
  const fs = SHEET.L / 46;
  const svg = frame(-fs, -fs * 2.4, SHEET.L + 2 * fs, SHEET.W + fs * 3.6, fs);
  svg.append(s('rect', { x: 0, y: 0, width: SHEET.L, height: SHEET.W, fill: 'url(#hatch)', class: 'sheet' }));
  const b = board(sheet.decor);
  const fill = tint(sheet.decor);
  for (const p of sheet.parts) {
    const r = rowsByNo.get(p.no);
    svg.append(s('rect', { x: p.x, y: p.y, width: p.w, height: p.h, class: 'part', fill: shade(fill, 1.0), 'fill-opacity': 0.9 }));
    if (r.grain) {
      const lines = s('g', { class: 'grain' });
      for (let gy = p.y + 18; gy < p.y + p.h - 6; gy += 26) lines.append(s('line', { x1: p.x + 6, y1: gy, x2: p.x + p.w - 6, y2: gy }));
      svg.append(lines);
    }
    const big = Math.min(p.w, p.h) > fs * 2.2;
    svg.append(txt(p.x + p.w / 2, p.y + p.h / 2 + (big ? -fs * 0.15 : fs * 0.35), p.no, { 'font-size': big ? fs * 1.2 : fs * 0.8, class: 'part-no' }));
    if (big) svg.append(txt(p.x + p.w / 2, p.y + p.h / 2 + fs * 1.05, `${r1(p.rot ? r.wid : r.len)}×${r1(p.rot ? r.len : r.wid)}`, { 'font-size': fs * 0.7, class: 'part-dim', direction: 'ltr' }));
  }
  svg.append(txt(SHEET.L, -fs * 0.8, `${b.name} · ${sheet.t} מ״מ · ${SHEET.L}×${SHEET.W}`, { 'font-size': fs * 0.9, class: 'sheet-title', 'text-anchor': 'start' }));
  svg.append(txt(0, -fs * 0.8, `ניצולת ${Math.round(sheet.yield * 100)}%`, { 'font-size': fs * 0.9, class: 'sheet-title', 'text-anchor': 'end' }));
  return svg;
}

/** Tiny edge-banding glyph: a rectangle whose banded edges are drawn heavy. */
export function edgeGlyph(edges) {
  const svg = s('svg', { viewBox: '0 0 30 16', class: 'edge-glyph', 'aria-hidden': 'true' });
  svg.append(s('rect', { x: 2, y: 2, width: 26, height: 12, class: 'eg-box' }));
  const seg = (on, x1, y1, x2, y2) => on && svg.append(s('line', { x1, y1, x2, y2, class: 'eg-on' }));
  seg(edges.l1, 2, 14, 28, 14);
  seg(edges.l2, 2, 2, 28, 2);
  seg(edges.w1, 2, 2, 2, 14);
  seg(edges.w2, 28, 2, 28, 14);
  return svg;
}
