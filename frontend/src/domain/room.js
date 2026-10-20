// The room around the wardrobe (ADR-037): its floor plan from a template, its walls, where the wardrobe stands,
// and what that means in front of and beside it. Mirrors backend/app/domain/room.py.
//
// The plan is in mm, x to the right and y down, as seen from above. Corners run clockwise on screen, so every
// wall's inside is on the right of its direction, and facing a wall from inside the room its start is on the
// left. The wardrobe's back stands against wall `room.wall`, its left outer face `room.offset` mm from that
// wall's start. Templates keep every wall axis-aligned, so all distances are whole millimetres.
//
// Openings (doors, windows, passages) are placed the same way: `at` mm from their wall's start, facing it from
// inside the room, and a door's hinge side is seen from there too.

export const ROOM_KINDS = Object.freeze(['rect', 'l', 'recess']);
export const MIN_WALL = 300; // mm: every wall of a template is at least this long
// The wall a new room puts the wardrobe on: the top wall, or the back of the recess (a niche).
export const DEFAULT_WALL = Object.freeze({ rect: 0, l: 0, recess: 2 });
// The fields of each template and the limit each takes (defaults LIMITS).
export const SHAPE_LIMITS = Object.freeze({
  rect: Object.freeze({ width: 'roomSize', depth: 'roomSize' }),
  l: Object.freeze({ width: 'roomSize', depth: 'roomSize', cutWidth: 'roomPart', cutDepth: 'roomPart' }),
  recess: Object.freeze({ width: 'roomSize', depth: 'roomSize', recessX: 'roomPart', recessWidth: 'roomPart', recessDepth: 'roomPart' }),
});

/** The floor plan's corners, clockwise on screen (y down), starting at the top-left. */
export function roomCorners(shape) {
  const { width: w, depth: d } = shape;
  if (shape.kind === 'l') { // the top-right corner is cut away
    const { cutWidth: cw, cutDepth: cd } = shape;
    return [[0, 0], [w - cw, 0], [w - cw, cd], [w, cd], [w, d], [0, d]];
  }
  if (shape.kind === 'recess') { // a niche going out of the top wall
    const { recessX: rx, recessWidth: rw, recessDepth: rd } = shape;
    return [[0, 0], [rx, 0], [rx, -rd], [rx + rw, -rd], [rx + rw, 0], [w, 0], [w, d], [0, d]];
  }
  return [[0, 0], [w, 0], [w, d], [0, d]];
}

/** Each wall: { start, end, length }; wall i runs from corner i to corner i + 1. */
export function roomWalls(shape) {
  const pts = roomCorners(shape);
  return pts.map((start, i) => {
    const end = pts[(i + 1) % pts.length];
    return { start, end, length: Math.round(Math.hypot(end[0] - start[0], end[1] - start[1])) };
  });
}

/** Template fields that cannot make a room: [[field, message]]. Ranges are checked separately. */
export function shapeIssues(shape) {
  const issues = [];
  if (shape.kind === 'l') {
    if (shape.cutWidth > shape.width - MIN_WALL) issues.push(['cutWidth', `the cut must leave at least ${MIN_WALL} mm of the width`]);
    if (shape.cutDepth > shape.depth - MIN_WALL) issues.push(['cutDepth', `the cut must leave at least ${MIN_WALL} mm of the depth`]);
  } else if (shape.kind === 'recess' && shape.recessX + shape.recessWidth > shape.width - MIN_WALL) {
    issues.push(['recessWidth', `the recess must end at least ${MIN_WALL} mm before the right wall`]);
  }
  return issues;
}

/** The offset that centres a wardrobe `width` wide on `wall` (0 when it is wider than the wall). */
export const centred = (shape, wall, width) => Math.max(0, Math.floor((roomWalls(shape)[wall].length - width) / 2));

/** The wardrobe's wall: its start, the unit vector along it and the unit normal into the room. */
export function wardrobeFrame(design) {
  const { room } = design;
  const wall = roomWalls(room.shape)[room.wall];
  const [[x0, y0], [x1, y1]] = [wall.start, wall.end];
  const u = [(x1 - x0) / wall.length, (y1 - y0) / wall.length];
  return { start: [x0, y0], u, n: [-u[1], u[0]] };
}

/** A plan point `along` mm from the wardrobe wall's start and `into` mm into the room. */
function point(design, along, into) {
  const { start: [x0, y0], u, n } = wardrobeFrame(design);
  return [x0 + u[0] * along + n[0] * into, y0 + u[1] * along + n[1] * into];
}

/**
 * A plan point in the viewer's frame (mm): x along the wardrobe from its left outer face, z toward the front
 * (the carcass back is at z = -depth, its front at 0).
 */
export function toWardrobe(design, [px, py]) {
  const { start: [x0, y0], u, n } = wardrobeFrame(design);
  const [dx, dy] = [px - x0, py - y0];
  return [dx * u[0] + dy * u[1] - design.room.offset, dx * n[0] + dy * n[1] - design.dimensions.depth];
}

/** Distance from `origin` along the unit `direction` to the nearest wall (null when nothing is hit). */
function hit(origin, direction, shape) {
  let best = null;
  for (const { start: [ax, ay], end: [bx, by] } of roomWalls(shape)) {
    const [ex, ey] = [bx - ax, by - ay];
    const denom = direction[0] * ey - direction[1] * ex;
    if (Math.abs(denom) < 1e-9) continue; // parallel: never hit
    const [qx, qy] = [ax - origin[0], ay - origin[1]];
    const t = (qx * ey - qy * ex) / denom;
    const s = (qx * direction[1] - qy * direction[0]) / denom;
    if (t >= -1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (best === null || t < best)) best = Math.max(0, t);
  }
  return best;
}

/** A plan point as [along the wardrobe's wall from its start, into the room]. */
function local(design, [px, py]) {
  const { start: [x0, y0], u, n } = wardrobeFrame(design);
  const [dx, dy] = [px - x0, py - y0];
  return [dx * u[0] + dy * u[1], dx * n[0] + dy * n[1]];
}

/** Whether (a, b) is inside the polygon or on its boundary. */
function inside(poly, a, b) {
  const eps = 1e-6;
  for (let i = 0; i < poly.length; i += 1) {
    const [pa, pb] = poly[i];
    const [qa, qb] = poly[(i + 1) % poly.length];
    const onLine = Math.abs((qa - pa) * (b - pb) - (qb - pb) * (a - pa)) < eps;
    if (onLine && a >= Math.min(pa, qa) - eps && a <= Math.max(pa, qa) + eps && b >= Math.min(pb, qb) - eps && b <= Math.max(pb, qb) + eps) return true;
  }
  let result = false;
  for (let i = 0; i < poly.length; i += 1) {
    const [pa, pb] = poly[i];
    const [qa, qb] = poly[(i + 1) % poly.length];
    if ((pb > b) !== (qb > b) && a < pa + ((qa - pa) * (b - pb)) / (qb - pb)) result = !result;
  }
  return result;
}

/** Whether the segment p-q passes through the open rectangle (a0, a1) x (b0, b1) (clipped, Liang-Barsky). */
function crosses(p, q, a0, a1, b0, b1) {
  const [da, db] = [q[0] - p[0], q[1] - p[1]];
  let [t0, t1] = [0, 1];
  for (const [pk, qk] of [[-da, p[0] - a0], [da, a1 - p[0]], [-db, p[1] - b0], [db, b1 - p[1]]]) {
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (t0 > t1) return false;
  const t = (t0 + t1) / 2; // a chord of a convex box is inside it unless it runs along its edge
  const [ma, mb] = [p[0] + da * t, p[1] + db * t];
  return a0 + 1e-6 < ma && ma < a1 - 1e-6 && b0 + 1e-6 < mb && mb < b1 - 1e-6;
}

/** Whether the wardrobe's footprint lies inside the room (touching walls is fine). True without a room. */
export function fits(design) {
  if (!design.room) return true;
  const { width: w, depth: d } = design.dimensions;
  const [a0, a1] = [design.room.offset, design.room.offset + w];
  const poly = roomCorners(design.room.shape).map((c) => local(design, c));
  if (![[a0, 0], [a1, 0], [a1, d], [a0, d]].every(([a, b]) => inside(poly, a, b))) return false;
  return !poly.some((p, i) => crosses(p, poly[(i + 1) % poly.length], a0, a1, 0, d));
}

const whole = (value) => (value === null ? null : Math.floor(value + 0.5));
const nearest = (hits) => {
  const known = hits.filter((h) => h !== null);
  return known.length ? whole(Math.min(...known)) : null;
};

/** Free floor in front of the wardrobe to the nearest wall, from the room (mm); null without a room or when it does not fit. */
export function frontClearance(design) {
  if (!design.room || !fits(design)) return null;
  const { width: w, depth: d } = design.dimensions;
  const { n } = wardrobeFrame(design);
  return nearest([1, w / 2, w - 1].map((a) => hit(point(design, design.room.offset + a, d), n, design.room.shape)));
}

/** Free space beside the wardrobe's `side` ('left'/'right') face to the nearest wall (mm); null without a room or a fit. */
export function sideGap(design, side) {
  if (!design.room || !fits(design)) return null;
  const { width: w, depth: d } = design.dimensions;
  const { u } = wardrobeFrame(design);
  const along = side === 'left' ? design.room.offset : design.room.offset + w;
  const direction = side === 'left' ? [-u[0], -u[1]] : u;
  return nearest([1, d / 2, d - 1].map((b) => hit(point(design, along, b), direction, design.room.shape)));
}

/** The free floor in front of the wardrobe: the customer's measurement, else the room's. */
export function effectiveClearance(design) {
  const measured = design.site?.clearance;
  return measured !== null && measured !== undefined ? measured : frontClearance(design);
}

// ---------- openings (ADR-037 stage 3) ----------

export const OPENING_TYPES = Object.freeze(['door', 'window', 'passage']);
// The fields only one type takes, and the value a new opening of that type gets.
export const OPENING_ONLY = Object.freeze({ sill: 'window', hinge: 'door', swing: 'door' });
export const DEFAULT_OPENING = Object.freeze({ sill: 900, hinge: 'left', swing: 'in' });
// Which limit each opening field takes (defaults LIMITS).
export const OPENING_LIMITS = Object.freeze({ at: 'openingAt', width: 'openingWidth', height: 'openingHeight', sill: 'openingSill' });

/** Where the opening starts above the floor: a window's sill, else the floor. */
export const openingBottom = (opening) => opening.sill ?? 0;

/** Whether two openings in one wall share any of it (along it and in height). */
function overlap(a, b) {
  const along = a.at < b.at + b.width && b.at < a.at + a.width;
  const [ya, yb] = [openingBottom(a), openingBottom(b)];
  return along && ya < yb + b.height && yb < ya + a.height;
}

/** What makes the room's openings impossible: [[error code, path, message]]. Ranges are checked separately. */
export function openingIssues(room, ceiling) {
  const lengths = roomWalls(room.shape).map((w) => w.length);
  const issues = [];
  room.openings.forEach((item, i) => {
    const path = `room.openings[${i}]`;
    for (const [field, kind] of Object.entries(OPENING_ONLY)) {
      if ((item.type === kind) !== (item[field] !== null)) {
        issues.push(['SCHEMA_INVALID', `${path}.${field}`, item.type === kind ? `a ${kind} needs ${field}` : `only a ${kind} has ${field}`]);
      }
    }
    if (item.wall < 0 || item.wall >= lengths.length) {
      issues.push(['OUT_OF_RANGE', `${path}.wall`, `the room has walls 0..${lengths.length - 1}`]);
      return;
    }
    if (item.at + item.width > lengths[item.wall]) issues.push(['OUT_OF_BOUNDS', `${path}.width`, `the opening runs past the end of wall ${item.wall}`]);
    if (ceiling !== null && openingBottom(item) + item.height > ceiling) issues.push(['OUT_OF_BOUNDS', `${path}.height`, 'the opening goes above the ceiling']);
    const clash = room.openings.slice(0, i).findIndex((other) => other.wall === item.wall && overlap(other, item));
    if (clash >= 0) issues.push(['OUT_OF_BOUNDS', `${path}.at`, `the opening overlaps opening ${clash}`]);
  });
  return issues;
}
