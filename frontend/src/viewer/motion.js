// What moves in the live view, and when. Pure and Node-safe.
// - motionAt(t): the open sequence as one deterministic timeline (t 0..1): the doors open first,
//   then, overlapping slightly, the drawers and the trouser racks slide out and the pull-down rails
//   come down. Played backwards it closes. The video recorder poses frames from it.
// - pullOutAccess(design): for every pull-out, whether a door is in front of it (covered) and whether
//   it can come out once the doors are open (reachable: hinged doors swing clear, sliding panels only
//   uncover part of the front).
// - motionTargets(): where each part is headed for the store state: a selected pull-out comes out
//   alone (once nothing closed is in front of it); otherwise ui.doorsOpen opens every reachable one.
import { SLIDING_OVERLAP, doorRects } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { insertZone, pulldownLinkage, pulldownReach } from './builders/inserts.js';
import { VISUAL } from './units.js';

/** The open sequence: the share of t over which each category of part moves. */
export const SEQUENCE = Object.freeze({
  doors: Object.freeze([0, 0.45]),
  drawers: Object.freeze([0.35, 0.8]),
  trousers: Object.freeze([0.35, 0.8]),
  pulldown: Object.freeze([0.45, 1]),
});
export const PULL_OUT_CATEGORIES = Object.freeze(['drawers', 'trousers', 'pulldown']);
const MOVING_INSERTS = Object.freeze({ trousers: 'trousers', pulldown: 'pulldown' });
const SLIDING_TOLERANCE = 10; // mm a sliding panel may overlap an opening and still let a part out

const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const smooth = (x) => x * x * (3 - 2 * x); // ease in and out: starts and lands at rest

/** Openness 0..1 of every category at sequence time t 0..1: { doors, drawers, trousers, pulldown }. */
export function motionAt(t) {
  const time = clamp01(t);
  return Object.fromEntries(Object.entries(SEQUENCE).map(([part, [start, end]]) =>
    [part, smooth(clamp01((time - start) / (end - start)))]));
}

/**
 * Every pull-out of the design: [{ id, category, compartmentId, x0, x1, y0, y1, yields }], in mm
 * (x from the outer left face, y above the floor), [y0, y1] being the height its front sweeps. A
 * drawer or rack under a pull-down whose lowered garments would hit it `yields` to the pull-down:
 * the open sequence leaves it in.
 */
export function pullOutParts(design, frame = frameOf(design)) {
  return design.compartments.flatMap((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const at = (y0, y1) => ({ compartmentId: compartment.id, x0: x0 + VISUAL.drawerGap, x1: x1 - VISUAL.drawerGap, y0: frame.baseY + y0, y1: frame.baseY + y1 });
    const inserts = compartment.inserts ?? [];
    const reaches = inserts.filter((insert) => insert.type === 'pulldown')
      .map((insert) => [pulldownReach(frame, compartment, insert), insert.y]);
    const yields = (y0, y1) => reaches.some(([low, rail]) => y0 < rail && y1 > low);
    return [
      ...compartment.drawers.map((drawer) => ({
        id: drawer.id, category: 'drawers', ...at(drawer.y, drawer.y + drawer.height), yields: yields(drawer.y, drawer.y + drawer.height),
      })),
      ...inserts.filter((insert) => MOVING_INSERTS[insert.type]).map((insert) => {
        if (insert.type === 'trousers') {
          const [y0, y1] = insertZone(insert);
          return { id: insert.id, category: 'trousers', ...at(y0, y1), yields: yields(y0, y1) };
        }
        const { at: railAt, to } = pulldownLinkage(frame, compartment, insert);
        return { id: insert.id, category: 'pulldown', ...at(railAt(to).y - frame.baseY - VISUAL.railRadius, insert.y + VISUAL.railRadius), yields: false };
      }),
    ];
  });
}

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/** Whether the scene shows doors (they can be hidden in the viewer). */
export function doorsInScene(design, { doorsVisible = true } = {}) {
  return doorsVisible !== false && doorRects(design, frameOf(design)).length > 0;
}

/**
 * Access of every pull-out: Map(id -> { category, covered, reachable, yields }). Without doors in
 * the scene (type none, no items, or hidden) nothing is covered.
 */
export function pullOutAccess(design, { doorsVisible = true } = {}) {
  const frame = frameOf(design);
  const rects = doorsVisible !== false ? doorRects(design, frame) : [];
  const sliding = design.doors.type === 'sliding';
  // Sliding panels at rest and opened: odd panels run over their neighbour (doorMotion.js).
  const travel = (rect) => (rect.index % 2 === 1 ? rect.width - (rects.length > 1 ? SLIDING_OVERLAP : 0) : 0);
  const blocks = (part, shift) => (rect) => {
    const x = rect.x0 - shift(rect);
    const tolerance = sliding ? SLIDING_TOLERANCE : 0;
    return overlap(x, x + rect.width, part.x0, part.x1) > tolerance && overlap(rect.y0, rect.y0 + rect.height, part.y0, part.y1) > 0;
  };
  return new Map(pullOutParts(design, frame).map((part) => {
    const covered = rects.some(blocks(part, () => 0));
    const reachable = !covered || !sliding || !rects.some(blocks(part, travel));
    return [part.id, { category: part.category, covered, reachable, yields: part.yields }];
  }));
}

/** Whether a part can be out with the doors in the scene set to `doorsOpen`. */
const free = (part, hasDoors, doorsOpen) => !hasDoors || !part.covered || (doorsOpen && part.reachable);

/**
 * Final openness (0 | 1) the store state asks of every moving part, before any sequencing:
 * { doors, parts: Map(id -> 0 | 1) }. `selectedId` drives a single pull-out when it names one.
 */
export function motionTargets(access, { doorsOpen = false, hasDoors = false, selectedId = null } = {}) {
  const selected = selectedId !== null && access.has(selectedId) ? selectedId : null;
  const parts = new Map([...access].map(([id, part]) => {
    const out = selected !== null
      ? id === selected && free(part, hasDoors, doorsOpen)
      : doorsOpen && !part.yields && free(part, hasDoors, true);
    return [id, out ? 1 : 0];
  }));
  return { doors: doorsOpen ? 1 : 0, parts };
}

/**
 * The deterministic pose at sequence time t: { doors, parts: Map(id -> openness) }. Parts that stay
 * blocked with the doors open, or yield to a pull-down, stay in.
 */
export function sequencePose(access, t, { hasDoors = false } = {}) {
  const at = motionAt(t);
  const parts = new Map([...access].map(([id, part]) =>
    [id, !part.yields && free(part, hasDoors, true) ? at[part.category] : 0]));
  return { doors: at.doors, parts };
}
