// Guillotine sheet nesting: every cut runs edge to edge, as on a panel saw.
// Best-short-side fit, shorter-leftover-axis split, kerf between parts and a trim at the edges.
// Wood-grain parts keep their length along the sheet length; plain decors may rotate.
import { SHEET } from './production.js';

export function nest(rows, sheet = SHEET) {
  const groups = new Map();
  const oversize = [];
  const ux = sheet.L - 2 * sheet.trim;
  const uy = sheet.W - 2 * sheet.trim;
  for (const r of rows) {
    const key = `${r.decor}|${r.t}`;
    if (!groups.has(key)) groups.set(key, { decor: r.decor, t: r.t, items: [] });
    for (let i = 0; i < r.qty; i++) {
      const fits = (r.len <= ux && r.wid <= uy) || (!r.grain && r.wid <= ux && r.len <= uy);
      if (!fits) { oversize.push(r); break; }
      groups.get(key).items.push({ no: r.no, len: r.len, wid: r.wid, rotatable: !r.grain });
    }
  }

  const sheets = [];
  for (const g of groups.values()) {
    const items = g.items.sort((a, b) => Math.max(b.len, b.wid) - Math.max(a.len, a.wid) || b.len * b.wid - a.len * a.wid);
    const mine = [];
    for (const it of items) {
      let best = null;
      for (const s of mine) {
        s.free.forEach((f, fi) => {
          for (const [w, h, rot] of orientations(it)) {
            if (w > f.w + 1e-6 || h > f.h + 1e-6) continue;
            const score = Math.min(f.w - w, f.h - h);
            if (!best || score < best.score) best = { s, fi, w, h, rot, score };
          }
        });
      }
      if (!best) {
        const s = { decor: g.decor, t: g.t, parts: [], free: [{ x: sheet.trim, y: sheet.trim, w: ux, h: uy }] };
        mine.push(s);
        const [w, h, rot] = orientations(it).find(([w2, h2]) => w2 <= ux && h2 <= uy);
        best = { s, fi: 0, w, h, rot };
      }
      place(best, it, sheet.kerf);
    }
    for (const s of mine) {
      const used = s.parts.reduce((a, p) => a + p.w * p.h, 0);
      s.yield = used / (sheet.L * sheet.W);
      delete s.free;
      sheets.push(s);
    }
  }
  const byBoard = new Map();
  for (const s of sheets) byBoard.set(s.decor, (byBoard.get(s.decor) ?? 0) + 1);
  const total = sheets.reduce((a, s) => a + s.yield, 0);
  return { sheets, byBoard, oversize, avgYield: sheets.length ? total / sheets.length : 0 };
}

function orientations(it) {
  const o = [[it.len, it.wid, false]];
  if (it.rotatable && it.len !== it.wid) o.push([it.wid, it.len, true]);
  return o;
}

function place({ s, fi, w, h, rot }, it, kerf) {
  const f = s.free[fi];
  s.parts.push({ no: it.no, x: f.x, y: f.y, w, h, rot });
  s.free.splice(fi, 1);
  const rightW = f.w - w - kerf;
  const topH = f.h - h - kerf;
  // Shorter-leftover-axis split keeps the larger leftover in one piece.
  const horizontal = f.w - w < f.h - h;
  const right = { x: f.x + w + kerf, y: f.y, w: rightW, h: horizontal ? h : f.h };
  const top = { x: f.x, y: f.y + h + kerf, w: horizontal ? f.w : w, h: topH };
  for (const r of [right, top]) if (r.w > 30 && r.h > 30) s.free.push(r);
}
