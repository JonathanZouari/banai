// Stretch and shrink in 3D (ADR-039, stage 2): the handles a selected part shows, and what dragging one does.
// A handle sits on an edge; it moves along one axis (in the wardrobe's frame: x right, y up, z toward the front,
// or out of a room wall), and its value is that edge's place. Like dragRules.js it gives limits, snaps, a label,
// the ops a drop sends, a ghost box (mm) that previews the new size, and for a room the plan point that stays
// put, so the viewer can keep the room still on screen. Pure; every drop still goes through the engine.
//
// Handles: the wardrobe (left and right edges: width, the left one also moves it along its wall; top: height;
// front: depth), a drawer's or an insert's top edge (its height), an obstacle's edges (its size; skirting keeps
// its bottom on the floor), and the room's walls (its width and depth: every wall of a rectangle, the right and
// bottom walls of an L or a room with a recess).
import { LIMITS } from '../domain/defaults.js';
import { interiorHeight } from '../domain/geometry.js';
import { roomWalls, toWardrobe } from '../domain/room.js';
import { frameOf } from './builders/frame.js';
import { roomHeight } from './walls3d.js';

const cm = (mm) => (Math.round(mm) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];

/** The walls of each template that change its size: wall index → [field, sign of growth along the wall's outward normal]. */
const ROOM_WALLS = Object.freeze({
  rect: { 0: 'depth', 1: 'width', 2: 'depth', 3: 'width' },
  l: { 3: 'width', 4: 'depth' },
  recess: { 5: 'width', 6: 'depth' },
});

/** Every handle the current state shows: { key, owner, edge, at: [x, y, z] (mm, wardrobe frame) }. */
export function handlesFor(design, selection, active = null) {
  const out = [];
  const { width: W, height: H, depth: D } = design.dimensions;
  if (selection && (selection.kind === 'carcass' || selection.kind === 'door')) {
    out.push({ key: 'wardrobe:left', owner: { kind: 'wardrobe' }, edge: 'left', at: [0, H / 2, 0] });
    out.push({ key: 'wardrobe:right', owner: { kind: 'wardrobe' }, edge: 'right', at: [W, H / 2, 0] });
    out.push({ key: 'wardrobe:top', owner: { kind: 'wardrobe' }, edge: 'top', at: [W / 2, H, -D / 2] });
    out.push({ key: 'wardrobe:front', owner: { kind: 'wardrobe' }, edge: 'front', at: [W / 2, 40, 0] });
  }
  if (selection && (selection.kind === 'drawer' || selection.kind === 'insert')) {
    const found = findSized(design, selection.id);
    if (found) {
      const frame = frameOf(design);
      const [x0, x1] = frame.ranges[found.index];
      out.push({ key: `item:${selection.id}:top`, owner: { kind: 'item', id: selection.id }, edge: 'top',
        at: [(x0 + x1) / 2, frame.baseY + found.item.y + found.item.height, 0] });
    }
  }
  if (active?.kind === 'obstacle') {
    const o = design.site?.obstacles?.[active.index];
    if (o) {
      const z = -D;
      const owner = { kind: 'obstacle', index: active.index };
      out.push({ key: `obstacle:${active.index}:left`, owner, edge: 'left', at: [o.x, o.y + o.height / 2, z] });
      out.push({ key: `obstacle:${active.index}:right`, owner, edge: 'right', at: [o.x + o.width, o.y + o.height / 2, z] });
      out.push({ key: `obstacle:${active.index}:top`, owner, edge: 'top', at: [o.x + o.width / 2, o.y + o.height, z] });
      if (o.type !== 'panel') out.push({ key: `obstacle:${active.index}:bottom`, owner, edge: 'bottom', at: [o.x + o.width / 2, o.y, z] });
    }
  }
  if (design.room) {
    const walls = roomWalls(design.room.shape);
    Object.keys(ROOM_WALLS[design.room.shape.kind]).map(Number).forEach((i) => {
      const { start, end, length } = walls[i];
      // In the middle of the wall; on the wardrobe's own wall, in the middle of its longer free stretch (none
      // when both are too short): never behind the wardrobe, where it would catch presses meant for it.
      let along = length / 2;
      if (i === design.room.wall) {
        const [left, right] = [design.room.offset, length - design.room.offset - W];
        if (Math.max(left, right) < 250) return;
        along = left >= right ? left / 2 : length - right / 2;
      }
      const t = along / length;
      const point = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
      const [x, z] = toWardrobe(design, point);
      out.push({ key: `wall:${i}`, owner: { kind: 'wall', index: i }, edge: 'out', at: [x, 60, z] });
    });
  }
  return out;
}

function findSized(design, id) {
  for (const [index, compartment] of design.compartments.entries()) {
    const item = compartment.drawers.find((d) => d.id === id)
      ?? compartment.inserts.find((i) => i.id === id && i.y !== null && i.height !== null);
    if (item) return { item, compartment, index, kind: compartment.drawers.includes(item) ? 'drawer' : 'insert' };
  }
  return null;
}

/** The free height above an item that starts at `y` in its compartment (to the next thing up, or the top). */
function roomAbove(design, compartment, skip, y) {
  let top = interiorHeight(design);
  const consider = (a) => { if (a > y) top = Math.min(top, a); };
  compartment.shelves.forEach((s) => s.id !== skip && consider(s.y));
  compartment.drawers.forEach((d) => d.id !== skip && consider(d.y));
  compartment.rails.forEach((r) => r.id !== skip && consider(r.y));
  compartment.inserts.forEach((i) => i.id !== skip && i.y !== null && consider(i.y));
  return top - y;
}

/** The outward normal of room wall `i` in the wardrobe's frame (unit [x, y, z]). */
function wallOutward(design, i) {
  const { start, end } = roomWalls(design.room.shape)[i];
  const [a, b] = [toWardrobe(design, start), toWardrobe(design, end)];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  return [u[1], 0, -u[0]]; // the inward normal is [-u.z, u.x]; outward is its opposite
}

/**
 * How dragging `handle` resizes, or null. { axis: { vector, value, limits, snaps }, label(v), ops(v),
 * ghost(v) → { min, max } (mm, wardrobe frame), and how the camera keeps the scene still: shift(v) → [dx, dz] mm,
 * or for a room wall anchor: { before, after(v) }, a plan point that stays put (roomShift turns it into a shift) }.
 */
export function resizeSpec(design, handle) {
  const { owner, edge } = handle;
  const { width: W, height: H, depth: D } = design.dimensions;
  const room = design.room;

  if (owner.kind === 'wardrobe') {
    const wallLength = room ? roomWalls(room.shape)[room.wall].length : null;
    const [wMin, wMax] = LIMITS.width;
    // The engine scales every compartment with the width and keeps each at least LIMITS.compartmentWidth[0].
    const available = design.compartments.reduce((sum, c) => sum + c.width, 0);
    const smallest = Math.min(...design.compartments.map((c) => c.width));
    const narrowest = Math.max(wMin, W - available + Math.ceil((LIMITS.compartmentWidth[0] * available) / smallest) + design.compartments.length);
    if (edge === 'right') {
      const max = Math.min(wMax, room ? wallLength - room.offset : wMax);
      return {
        axis: { vector: X, value: W, limits: [Math.min(narrowest, W), Math.max(narrowest, max, W)], snaps: room ? [wallLength - room.offset, wallLength - room.offset - 50] : [] },
        label: (v) => `רוחב ${cm(v)} ס״מ`,
        ops: (v) => (v === W ? null : [{ op: 'update_dimensions', width: v }]),
        ghost: (v) => ({ min: [0, 0, -D], max: [v, H, 0] }),
      };
    }
    if (edge === 'left') { // the right edge stays: the width changes and, in a room, the wardrobe moves along its wall
      const lo = Math.max(W - wMax, room ? -room.offset : W - wMax);
      return {
        axis: { vector: X, value: 0, limits: [Math.min(lo, 0), Math.max(0, W - narrowest)], snaps: room ? [-room.offset, -room.offset + 50] : [] },
        label: (v) => `רוחב ${cm(W - v)} ס״מ`,
        ops: (v) => (v === 0 ? null : [{ op: 'update_dimensions', width: W - v }, ...(room ? [{ op: 'set_room', offset: room.offset + v }] : [])]),
        ghost: (v) => ({ min: [v, 0, -D], max: [W, H, 0] }),
        shift: (v) => [-v, 0], // the right edge stays where it is on screen
      };
    }
    if (edge === 'top') {
      const ceiling = design.site?.ceiling;
      // Never lower than the highest thing inside, plus the carcass's two panels and its plinth.
      const tops = design.compartments.flatMap((c) => [...c.shelves.map((x) => x.y + x.thickness), ...c.drawers.map((x) => x.y + x.height),
        ...c.rails.map((x) => x.y), ...c.inserts.filter((x) => x.y !== null).map((x) => x.y + (x.height ?? 0))]);
      const lowest = Math.max(LIMITS.height[0], Math.max(0, ...tops) + 2 * design.carcass.panelThickness + (design.carcass.plinthHeight ?? 0));
      return {
        axis: { vector: Y, value: H, limits: [Math.min(lowest, H), LIMITS.height[1]], snaps: ceiling ? [ceiling - 10] : [] },
        label: (v) => `גובה ${cm(v)} ס״מ`,
        ops: (v) => (v === H ? null : [{ op: 'update_dimensions', height: v }]),
        ghost: (v) => ({ min: [0, 0, -D], max: [W, v, 0] }),
      };
    }
    if (edge === 'front') { // the back stays against the wall: the front comes forward
      return {
        axis: { vector: Z, value: D, limits: LIMITS.depth, snaps: [600] },
        label: (v) => `עומק ${cm(v)} ס״מ`,
        ops: (v) => (v === D ? null : [{ op: 'update_dimensions', depth: v }]),
        ghost: (v) => ({ min: [0, 0, -D], max: [W, H, v - D] }),
        shift: (v) => [0, -(v - D)], // the back stays against the wall on screen
      };
    }
  }

  if (owner.kind === 'item') {
    const found = findSized(design, owner.id);
    if (!found) return null;
    const { item, compartment, index, kind } = found;
    const [lo, hi] = kind === 'drawer' ? LIMITS.drawerHeight : LIMITS.insertHeight;
    const max = Math.min(hi, roomAbove(design, compartment, item.id, item.y));
    const frame = frameOf(design);
    const [x0, x1] = frame.ranges[index];
    const op = kind === 'drawer' ? 'modify_drawer' : 'modify_insert';
    return {
      axis: { vector: Y, value: item.height, limits: [lo, Math.max(lo, max)], snaps: [max] },
      label: (v) => `${kind === 'drawer' ? 'מגירה' : 'תוספת'} בגובה ${cm(v)} ס״מ`,
      ops: (v) => (v === item.height ? null : [{ op, id: item.id, height: v }]),
      ghost: (v) => ({ min: [x0, frame.baseY + item.y, -D], max: [x1, frame.baseY + item.y + v, 0] }),
    };
  }

  if (owner.kind === 'obstacle') {
    const list = design.site?.obstacles ?? [];
    const o = list[owner.index];
    if (!o) return null;
    const [sMin, sMax] = LIMITS.obstacleSize;
    const top = roomHeight(design);
    const wallEnd = room ? roomWalls(room.shape)[room.wall].length - room.offset : LIMITS.obstacleX[1];
    const wallStart = room ? Math.max(-room.offset, LIMITS.obstacleX[0]) : LIMITS.obstacleX[0];
    const replace = (change) => [{ op: 'set_site', obstacles: list.map((item, i) => (i === owner.index ? { ...item, ...change } : item)) }];
    const ghost = (b) => ({ min: [b.x, b.y, -D], max: [b.x + b.w, b.y + b.h, -D + 40] });
    const at = { x: o.x, y: o.y, w: o.width, h: o.height };
    const specs = {
      right: { vector: X, value: o.x + o.width, limits: [o.x + sMin, Math.min(o.x + sMax, wallEnd)], box: (v) => ({ ...at, w: v - o.x }), change: (v) => ({ width: v - o.x }) },
      left: { vector: X, value: o.x, limits: [Math.max(o.x + o.width - sMax, wallStart), o.x + o.width - sMin], box: (v) => ({ ...at, x: v, w: o.x + o.width - v }), change: (v) => ({ x: v, width: o.x + o.width - v }) },
      top: { vector: Y, value: o.y + o.height, limits: [o.y + sMin, Math.min(o.y + sMax, top)], box: (v) => ({ ...at, h: v - o.y }), change: (v) => ({ height: v - o.y }) },
      bottom: { vector: Y, value: o.y, limits: [Math.max(0, o.y + o.height - sMax), o.y + o.height - sMin], box: (v) => ({ ...at, y: v, h: o.y + o.height - v }), change: (v) => ({ y: v, height: o.y + o.height - v }) },
    };
    const s = specs[edge];
    if (!s || (edge === 'bottom' && o.type === 'panel')) return null;
    const limits = [Math.min(s.limits[0], s.value), Math.max(s.limits[1], s.value)]; // one already past a wall end keeps its place
    return {
      axis: { vector: s.vector, value: s.value, limits, snaps: [] },
      label: (v) => { const b = s.box(v); return `${cm(b.w)}×${cm(b.h)} ס״מ`; },
      ops: (v) => (v === s.value ? null : replace(s.change(v))),
      ghost: (v) => ghost(s.box(v)),
    };
  }

  if (owner.kind === 'wall' && room) {
    const field = ROOM_WALLS[room.shape.kind][owner.index];
    if (!field) return null;
    const shape = room.shape;
    const value = shape[field];
    const [lo, hi] = LIMITS.roomSize;
    const walls = roomWalls(shape);
    const n = walls.length;
    const next = (owner.index + 1) % n; // moving this wall moves the next wall's start corner
    const prev = (owner.index - 1 + n) % n; // and the previous wall's end corner
    const startMoves = room.wall === next; // the wardrobe is measured from that corner: it moves with it
    const openings = room.openings ?? [];
    // How far in the wall may come: the template's own sense, the wardrobe's place and every opening on the two
    // walls that change length (each keeps its place in the room).
    let least = lo;
    if (shape.kind === 'l') least = Math.max(least, (field === 'width' ? shape.cutWidth : shape.cutDepth) + 300);
    if (shape.kind === 'recess' && field === 'width') least = Math.max(least, shape.recessX + shape.recessWidth + 300);
    if (startMoves) least = Math.max(least, value - room.offset);
    openings.forEach((o) => {
      if (o.wall === next) least = Math.max(least, value - o.at);
      if (o.wall === prev) least = Math.max(least, value - (walls[prev].length - o.at - o.width));
    });
    const outward = wallOutward(design, owner.index);
    // A plan point the change does not move, in the plan before and after. Templates grow to the right and down
    // from their top-left corner, so that corner stays unless a rectangle's left or top wall is the one moved.
    const fixed = (s) => {
      if (shape.kind === 'rect' && owner.index === 3) return [s.width, 0];
      if (shape.kind === 'rect' && owner.index === 0) return [0, s.depth];
      return [0, 0];
    };
    const wall = roomWalls(shape)[owner.index];
    const [a, b] = [toWardrobe(design, wall.start), toWardrobe(design, wall.end)];
    return {
      axis: { vector: outward, value, limits: [Math.min(least, value), hi], snaps: [] },
      label: (v) => `${field === 'width' ? 'רוחב החדר' : 'עומק החדר'} ${cm(v)} ס״מ`,
      ops: (v) => {
        if (v === value) return null;
        const shifted = openings.map((o) => (o.wall === next ? { ...o, at: o.at + v - value } : o)); // they stay in the room
        // A rectangle's left or top wall moves the plan's origin: the furniture's plan place follows, so it stays put.
        const [dx, dy] = shape.kind === 'rect' && owner.index === 3 ? [v - value, 0] : shape.kind === 'rect' && owner.index === 0 ? [0, v - value] : [0, 0];
        const things = (room.furniture ?? []).map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
        return [{ op: 'set_room', shape: { ...shape, [field]: v }, wall: room.wall, offset: room.offset + (startMoves ? v - value : 0),
          ...(openings.length ? { openings: shifted } : {}), ...(things.length && (dx || dy) ? { furniture: things } : {}) }];
      },
      ghost: (v) => {
        const d = v - value; // the wall's inner face moves out by d
        const [dx, dz] = [outward[0] * d, outward[2] * d];
        const xs = [a[0] + dx, b[0] + dx];
        const zs = [a[1] + dz, b[1] + dz];
        return { min: [Math.min(...xs) - 20, 0, Math.min(...zs) - 20], max: [Math.max(...xs) + 20, roomHeight(design), Math.max(...zs) + 20] };
      },
      anchor: { before: fixed(shape), after: (v) => fixed({ ...shape, [field]: v }) },
    };
  }
  return null;
}

/** How far the camera moves (mm, [x, z]) so the room stays still after `before` became `after`. */
export function roomShift(before, after, anchor, v) {
  if (!anchor || !before.room || !after.room) return [0, 0];
  const [p, q] = [toWardrobe(before, anchor.before), toWardrobe(after, anchor.after(v))];
  return [q[0] - p[0], q[1] - p[1]];
}
