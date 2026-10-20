// What may be dragged in 3D and how (ADR-039): for each target, the axes it moves on (straight lines only), its
// value along them (mm), the limits it stops at, the places it snaps to, the label shown while dragging and the
// ops a drop sends. Pure: the viewer (dragTool.js) turns pointer movement into millimetres along an axis and asks
// this module for the rest. Every drop still goes through the engine, which has the last word.
//
// Targets: { kind: 'wardrobe' } along its wall (with a room), { kind: 'item', id } for a shelf, drawer, rail or
// insert (up and down in its compartment), { kind: 'partition', id } (left and right), { kind: 'obstacle',
// index } on the wall behind (skirting only along the floor), { kind: 'opening', index } along its wall (a
// window also up and down).
import { LIMITS } from '../domain/defaults.js';
import { interiorHeight, partitionLeftEdge } from '../domain/geometry.js';
import { roomWalls } from '../domain/room.js';
import { roomHeight } from './walls3d.js';

export const GRID = 10; // mm: every value lands on a whole centimetre
export const SNAP = 20; // mm: within this of a snap point, the value takes it
const RAIL_SPAN = 0; // a rail is a line: nothing may contain it

const cm = (mm) => (Math.round(mm) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** `value` on the grid, pulled to a snap point within SNAP, inside `limits`. */
export function settle(value, limits, snaps = []) {
  let best = Math.round(value / GRID) * GRID;
  let gap = SNAP + 1;
  for (const s of snaps) {
    const d = Math.abs(value - s);
    if (d <= SNAP && d < gap && s >= limits[0] && s <= limits[1]) [best, gap] = [s, d];
  }
  return clamp(best, limits);
}

/** Where along `axis` (unit, through `point`) the pointer ray (origin, unit dir) comes closest; null when parallel. */
export function alongAxis(origin, dir, point, axis) {
  const w = [origin[0] - point[0], origin[1] - point[1], origin[2] - point[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const b = dot(dir, axis);
  const denom = 1 - b * b;
  if (denom < 1e-6) return null; // looking along the axis: no movement can be read from it
  return (dot(w, axis) - b * dot(w, dir)) / denom;
}

/** The spans (mm, from the interior floor) of everything in a compartment, except the item `skip`. */
function spans(compartment, skip) {
  const out = [];
  compartment.shelves.forEach((s) => { if (s.id !== skip) out.push([s.y, s.y + s.thickness]); });
  compartment.drawers.forEach((d) => { if (d.id !== skip) out.push([d.y, d.y + d.height]); });
  compartment.rails.forEach((r) => { if (r.id !== skip) out.push([r.y, r.y + RAIL_SPAN]); });
  compartment.inserts.forEach((i) => { if (i.id !== skip && i.y !== null && i.height !== null) out.push([i.y, i.y + i.height]); });
  return out;
}

/** The free range for something `size` tall that starts at `y`, between its neighbours and the interior. */
function freeRange(compartment, skip, y, size, top) {
  let [lo, hi] = [0, top - size];
  for (const [a, b] of spans(compartment, skip)) {
    if (b <= y) lo = Math.max(lo, b);
    else if (a >= y + size) hi = Math.min(hi, a - size);
  }
  return hi >= lo ? [lo, hi] : [y, y];
}

function findItem(design, id) {
  for (const compartment of design.compartments) {
    for (const [kind, list] of [['shelf', compartment.shelves], ['drawer', compartment.drawers], ['rail', compartment.rails], ['insert', compartment.inserts]]) {
      const item = list.find((x) => x.id === id);
      if (item) return { kind, item, compartment };
    }
  }
  return null;
}

const ITEM_OP = Object.freeze({ shelf: 'modify_shelf', drawer: 'modify_drawer', rail: 'modify_rail', insert: 'modify_insert' });
const ITEM_NAME = Object.freeze({ shelf: 'מדף', drawer: 'מגירה', rail: 'מוט', insert: 'תוספת' });

/**
 * How `target` moves in `design`, or null when it cannot be dragged. { axes: [{ key: 'x'|'y', value, limits,
 * snaps }], label(values) → text, ops(values) → op list or null when nothing changed }.
 */
export function dragSpec(design, target) {
  if (!target) return null;
  const W = design.dimensions.width;

  if (target.kind === 'wardrobe') {
    const { room } = design;
    if (!room) return null; // without a room there is nothing to move along
    const length = roomWalls(room.shape)[room.wall].length;
    if (W > length) return null;
    const limits = [0, length - W];
    const snaps = [0, 50, Math.floor((length - W) / 2), length - W - 50, length - W];
    return {
      axes: [{ key: 'x', value: room.offset, limits, snaps }],
      label: ({ x }) => `${cm(x)} ס״מ מתחילת הקיר · ${cm(length - W - x)} ס״מ עד סופו`,
      ops: ({ x }) => (x === room.offset ? null : [{ op: 'set_room', offset: x }]),
    };
  }

  if (target.kind === 'item') {
    const found = findItem(design, target.id);
    if (!found) return null;
    const { kind, item, compartment } = found;
    if (kind === 'insert' && (item.y === null || item.y === undefined)) return null; // a LED strip has no place
    const size = kind === 'shelf' ? item.thickness : kind === 'rail' ? RAIL_SPAN : (item.height ?? 0);
    const limits = freeRange(compartment, item.id, item.y, size, interiorHeight(design));
    return {
      axes: [{ key: 'y', value: item.y, limits, snaps: limits }],
      label: ({ y }) => `${ITEM_NAME[kind]} · ${cm(y)} ס״מ מתחתית הארון הפנימית`,
      ops: ({ y }) => (y === item.y ? null : [{ op: ITEM_OP[kind], id: item.id, y }]),
    };
  }

  if (target.kind === 'partition') {
    const j = design.partitions.findIndex((p) => p.id === target.id);
    if (j < 0) return null;
    const edge = partitionLeftEdge(design, j);
    const [left, right] = [design.compartments[j], design.compartments[j + 1]];
    const min = LIMITS.compartmentWidth[0];
    const limits = [edge - left.width + min, edge + right.width - min];
    const middle = edge - left.width + Math.floor((left.width + right.width) / 2);
    return {
      axes: [{ key: 'x', value: edge, limits, snaps: [middle] }],
      label: ({ x }) => `תא שמאלי ${cm(left.width + x - edge)} ס״מ · תא ימני ${cm(right.width - (x - edge))} ס״מ`,
      ops: ({ x }) => (x === edge ? null : [{ op: 'modify_partition', partitionId: target.id, position: x }]),
    };
  }

  if (target.kind === 'obstacle') {
    const list = design.site?.obstacles ?? [];
    const o = list[target.index];
    if (!o) return null;
    // Along the wall the wardrobe stands on: within that wall when there is a room.
    let xLimits = LIMITS.obstacleX;
    if (design.room) {
      const length = roomWalls(design.room.shape)[design.room.wall].length;
      xLimits = [-design.room.offset, length - design.room.offset - o.width];
    }
    const top = roomHeight(design);
    const xs = { key: 'x', value: o.x, limits: [Math.max(xLimits[0], LIMITS.obstacleX[0]), Math.min(xLimits[1], LIMITS.obstacleX[1])],
      snaps: [0, W - o.width, Math.floor((W - o.width) / 2)] };
    const ys = { key: 'y', value: o.y, limits: [0, Math.max(0, top - o.height)], snaps: [0, top - o.height] };
    const axes = o.type === 'panel' ? [xs] : [xs, ys]; // skirting stays on the floor
    const values = (v) => ({ x: v.x ?? o.x, y: v.y ?? o.y });
    return {
      axes,
      label: (v) => `${cm(values(v).x)} ס״מ מקצה הארון השמאלי · ${cm(values(v).y)} ס״מ מהרצפה`,
      ops: (v) => {
        const { x, y } = values(v);
        if (x === o.x && y === o.y) return null;
        return [{ op: 'set_site', obstacles: list.map((item, i) => (i === target.index ? { ...item, x, y } : item)) }];
      },
    };
  }

  if (target.kind === 'opening') {
    const openings = design.room?.openings ?? [];
    const o = openings[target.index];
    if (!o) return null;
    const length = roomWalls(design.room.shape)[o.wall].length;
    const along = { key: 'x', value: o.at, limits: [0, Math.max(0, length - o.width)], snaps: [0, Math.floor((length - o.width) / 2), length - o.width] };
    const axes = [along];
    if (o.type === 'window' && o.sill !== null) {
      const top = roomHeight(design);
      axes.push({ key: 'y', value: o.sill, limits: [0, Math.max(0, top - o.height)], snaps: [] });
    }
    const values = (v) => ({ at: v.x ?? o.at, sill: v.y ?? o.sill });
    return {
      axes,
      label: (v) => `${cm(values(v).at)} ס״מ מתחילת הקיר${o.type === 'window' ? ` · אדן ${cm(values(v).sill)} ס״מ` : ''}`,
      ops: (v) => {
        const { at, sill } = values(v);
        if (at === o.at && sill === o.sill) return null;
        return [{ op: 'set_room', openings: openings.map((item, i) => (i === target.index ? { ...item, at, ...(item.type === 'window' ? { sill } : {}) } : item)) }];
      },
    };
  }
  return null;
}

/** The drag target for a selected design component: the wardrobe (its carcass or a door), an item or a partition. */
export function targetForSelection(design, selection) {
  if (!selection) return null;
  if (selection.kind === 'carcass' || selection.kind === 'door') return { kind: 'wardrobe' };
  if (selection.kind === 'partition') return { kind: 'partition', id: selection.id };
  if (['shelf', 'drawer', 'rail', 'insert'].includes(selection.kind)) return { kind: 'item', id: selection.id };
  return null;
}

/** One keyboard step (1 cm, Shift 10 cm) of `target` along `key`: the ops, or null when it cannot move. */
export function nudge(design, target, key, sign, big = false) {
  const spec = dragSpec(design, target);
  const axis = spec?.axes.find((a) => a.key === key);
  if (!axis) return null;
  const next = clamp(axis.value + sign * (big ? 100 : 10), axis.limits);
  return spec.ops({ [key]: next });
}
