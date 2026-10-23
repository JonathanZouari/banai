// Measuring in 3D (ADR-040), the pure part: where a point snaps, a straight line along one axis, and how a
// distance reads. Points are [x, y, z] in millimetres in the viewer's frame (x right, y up, z toward the front).
// The viewer's tool (measureTool.js) gives the hit point, the hit object's box and a way to project to screen.

export const CORNER_PX = 14; // a corner this close on screen takes the point
export const EDGE_PX = 9; // else an edge this close takes it
export const MIN_MM = 1; // a shorter line is a click, not a measurement

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The 8 corners and 12 edges of an axis-aligned box { min, max } (mm). */
export function boxParts({ min, max }) {
  const corners = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  const edges = [];
  corners.forEach((a, i) => corners.forEach((b, j) => {
    const differs = [0, 1, 2].filter((k) => a[k] !== b[k]).length;
    if (j > i && differs === 1) edges.push([a, b]);
  }));
  return { corners, edges };
}

/** The point of segment a–b nearest to p. */
export function nearestOnSegment(p, [a, b]) {
  const ab = sub(b, a);
  const length2 = dot(ab, ab);
  if (length2 === 0) return a;
  const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / length2));
  return add(a, scale(ab, t));
}

/**
 * Where a point under the pointer lands: a corner of the hit object within CORNER_PX on screen, else the nearest
 * point of one of its edges within EDGE_PX, else the point itself. `shape` is { corners, edges } (the mesh's own,
 * so a wall's inner corner is a corner) or a box { min, max }. `toScreen(p)` → [x, y] pixels, or null for a point
 * behind the camera (never a snap). Returns { point, snap: 'corner' | 'edge' | null }.
 */
export function snapPoint(hit, shape, toScreen) {
  if (!shape) return { point: hit, snap: null };
  const at = toScreen(hit);
  if (!at) return { point: hit, snap: null };
  const px = (p) => { const s = toScreen(p); return s ? Math.hypot(s[0] - at[0], s[1] - at[1]) : Infinity; };
  const { corners, edges } = shape.corners ? shape : boxParts(shape);
  let best = null;
  for (const c of corners) {
    const d = px(c);
    if (d <= CORNER_PX && (!best || d < best.d)) best = { point: c, snap: 'corner', d };
  }
  if (best) return { point: best.point, snap: 'corner' };
  for (const e of edges) {
    const q = nearestOnSegment(hit, e);
    const d = px(q);
    if (d <= EDGE_PX && (!best || d < best.d)) best = { point: q, snap: 'edge', d };
  }
  return best ? { point: best.point, snap: 'edge' } : { point: hit, snap: null };
}

/** `b` moved onto a straight line from `a` along the axis it leans to most (Shift). */
export function lockAxis(a, b) {
  const d = sub(b, a).map(Math.abs);
  const axis = d.indexOf(Math.max(...d));
  return a.map((v, k) => (k === axis ? b[k] : v));
}

const cm = (mm) => (Math.round(mm) / 10).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A measurement from `a` to `b`: { mm, dx, dy, dz, label, detail } (lengths rounded to whole millimetres). */
export function describe(a, b) {
  const [dx, dy, dz] = sub(b, a).map((v) => Math.round(Math.abs(v)));
  const mm = Math.round(Math.hypot(...sub(b, a)));
  const parts = [[dx, 'רוחב'], [dy, 'גובה'], [dz, 'עומק']].filter(([v]) => v >= MIN_MM && v !== mm);
  return {
    mm, dx, dy, dz,
    label: `${cm(mm)} ס״מ`,
    detail: parts.map(([v, name]) => `${name} ${cm(v)}`).join(' · '),
  };
}
