// Where the furniture goes: a small, deterministic solver. Each preset lists pieces with preferred
// spots (against a wall, beside, facing or under another piece, in a corner). The first spot that
// is valid wins:
// - inside the room, clear of the wardrobe, the walls and the other pieces (rugs lie under others);
// - the doorway stays clear, and tall pieces stay out of the window;
// - nothing stands between the doorway and the wardrobe's front: every sightline from the doorway
//   eye to points on the wardrobe front stays clear, so the wardrobe is always the hero.
// A piece (with its companions, e.g. a desk with its chair) that fits nowhere is left out and
// reported. Pure: mm only, no three.js.
import { FURNITURE, footprint } from './catalog.js';
import { insideRoom, overlaps, roomBox, WARDROBE_FRONT, wardrobeFootprint } from './layout.js';

const STEP = 50; // mm between candidate positions along a wall
const EYE_HEIGHT = 1650;
const DOOR_CLEAR = 900; // floor kept free inside the doorway

/** Standing in the doorway, looking in: the doorway view's eye, `back` mm toward the threshold. */
export const doorwayEye = (box, back = 0) => ({ x: (box.door.x0 + box.door.x1) / 2, y: EYE_HEIGHT, z: box.zFront - 300 + back });
/** Every spot the doorway view may stand on (views.js steps back up to the threshold). */
export const DOORWAY_STEPS = Object.freeze([0, 150, 300, 450]);

/** Points on the wardrobe's front: 5 across, low / middle / high. */
export function wardrobeSamples(design) {
  const { width, height } = design.dimensions;
  const xs = [0.03, 0.27, 0.5, 0.73, 0.97].map((f) => width * f);
  return xs.flatMap((x) => [60, height / 2, height - 60].map((y) => ({ x, y, z: WARDROBE_FRONT })));
}

/** Does the segment a-b pass through the box (x0..x1, y0..y1, z0..z1)? Slab test. */
export function segmentHitsBox(a, b, box) {
  let t0 = 0;
  let t1 = 1;
  for (const [axis, lo, hi] of [['x', box.x0, box.x1], ['y', box.y0, box.y1], ['z', box.z0, box.z1]]) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-9) {
      if (a[axis] <= lo || a[axis] >= hi) return false;
    } else {
      let near = (lo - a[axis]) / d;
      let far = (hi - a[axis]) / d;
      if (near > far) [near, far] = [far, near];
      t0 = Math.max(t0, near);
      t1 = Math.min(t1, far);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/** Would a piece with this rectangle and height hide part of the wardrobe from `eye`? */
export const blocksView = (rect, height, eye, samples) => samples.some((point) => segmentHitsBox(eye, point, { ...rect, y0: 0, y1: height }));

// Preset recipes. `at` lists spots in order of preference.
export const PRESETS = Object.freeze({
  couple: Object.freeze([
    { id: 'bed', kind: 'doubleBed', at: [{ wall: 'front', from: 'end' }, { wall: 'right', from: 'end' }, { wall: 'left', from: 'end' }],
      with: [{ id: 'nightstand', kind: 'nightstand', at: [{ beside: 'bed' }], optional: true }] },
    { id: 'rug', kind: 'rug', at: [{ under: 'bed' }, { centre: true }] },
    { id: 'lamp', kind: 'floorLamp', at: [{ corner: 'back-left' }, { corner: 'back-right' }, { corner: 'front-right' }] },
    { id: 'plant', kind: 'plant', at: [{ corner: 'back-right' }, { corner: 'back-left' }, { corner: 'front-right' }] },
  ]),
  kids: Object.freeze([
    { id: 'bed', kind: 'singleBed', at: [{ wall: 'front', from: 'end' }, { wall: 'right', from: 'end' }, { wall: 'left', from: 'end' }] },
    { id: 'desk', kind: 'desk', at: [{ wall: 'right', from: 'start' }, { wall: 'left', from: 'start' }, { wall: 'front', from: 'start' }],
      with: [{ id: 'chair', kind: 'chair', at: [{ facing: 'desk' }] }] },
    { id: 'rug', kind: 'rug', at: [{ under: 'bed' }, { centre: true }] },
    { id: 'plant', kind: 'plant', at: [{ corner: 'back-left' }, { corner: 'back-right' }] },
  ]),
  teen: Object.freeze([
    { id: 'bed', kind: 'singleBed', at: [{ wall: 'front', from: 'end' }, { wall: 'right', from: 'end' }, { wall: 'left', from: 'end' }] },
    { id: 'desk', kind: 'gamingDesk', at: [{ wall: 'right', from: 'start' }, { wall: 'left', from: 'start' }, { wall: 'front', from: 'start' }],
      with: [{ id: 'chair', kind: 'gamingChair', at: [{ facing: 'desk' }] }] },
    { id: 'rug', kind: 'rug', at: [{ under: 'bed' }, { centre: true }] },
    { id: 'lamp', kind: 'floorLamp', at: [{ corner: 'back-left' }, { corner: 'back-right' }] },
  ]),
});
export const PRESET_IDS = Object.freeze(Object.keys(PRESETS));

// A piece against a wall: its back touches the wall and it faces into the room.
const WALLS = {
  back: { rotation: 0, place: (box, depth, along) => ({ x: along, z: box.zBack + depth / 2 }), range: (box) => [box.x0, box.x1] },
  front: { rotation: 180, place: (box, depth, along) => ({ x: along, z: box.zFront - depth / 2 }), range: (box) => [box.x0, box.x1] },
  left: { rotation: 90, place: (box, depth, along) => ({ x: box.x0 + depth / 2, z: along }), range: (box) => [box.zBack, box.zFront] },
  right: { rotation: 270, place: (box, depth, along) => ({ x: box.x1 - depth / 2, z: along }), range: (box) => [box.zBack, box.zFront] },
};

function* wallSpots(box, kind, { wall, from }) {
  const { width, depth } = FURNITURE[kind];
  const { rotation, place, range } = WALLS[wall];
  const [lo, hi] = range(box);
  const first = lo + width / 2;
  const last = hi - width / 2;
  const count = Math.floor((last - first) / STEP);
  for (let i = 0; i <= count; i += 1) {
    const along = from === 'end' ? last - i * STEP : first + i * STEP;
    yield { ...place(box, depth, along), rotation };
  }
}

const unit = (rotation) => ({ 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }[rotation]);

function* relativeSpots(box, kind, spot, placed) {
  const size = FURNITURE[kind];
  if (spot.corner) {
    const [zSide, xSide] = spot.corner.split('-');
    const x = xSide === 'left' ? box.x0 + size.width / 2 + 40 : box.x1 - size.width / 2 - 40;
    const z = zSide === 'back' ? box.zBack + size.depth / 2 + 40 : box.zFront - size.depth / 2 - 40;
    yield { x, z, rotation: 0 };
    return;
  }
  if (spot.centre) {
    yield { x: (box.x0 + box.x1) / 2, z: (box.zBack + box.zFront) / 2 + 300, rotation: 0 };
    return;
  }
  const ref = placed.find((p) => p.id === (spot.beside ?? spot.facing ?? spot.under));
  if (!ref) return;
  const refSize = FURNITURE[ref.kind];
  const [fx, fz] = unit(ref.rotation); // ref's facing direction
  const [ax, az] = [fz, -fx]; // along the wall it stands against
  if (spot.beside) {
    for (const side of [-1, 1]) {
      const offset = refSize.width / 2 + size.width / 2 + 30;
      const back = -refSize.depth / 2 + size.depth / 2; // flush with the same wall
      yield { x: ref.x + ax * offset * side + fx * back, z: ref.z + az * offset * side + fz * back, rotation: ref.rotation };
    }
  } else if (spot.facing) {
    const out = refSize.depth / 2 + size.depth / 2 - 180; // tucked a little under the desk
    for (const shift of [0, 150, -150, 300, -300, 450, -450]) {
      yield { x: ref.x + fx * out + ax * shift, z: ref.z + fz * out + az * shift, rotation: (ref.rotation + 180) % 360 };
    }
  } else if (spot.under) {
    // Under the foot of the bed, sticking out; across or along it, shifted to fit the room.
    const toward = refSize.depth / 2 - 300;
    for (const turn of [0, 90]) {
      for (const shift of [0, -200, 200, -400, 400, -600, 600]) {
        yield { x: ref.x + fx * toward + ax * shift, z: ref.z + fz * toward + az * shift, rotation: (ref.rotation + turn) % 360 };
      }
    }
  }
}

/** The rules a spot must meet (see the module comment). */
function valid(kind, rect, ctx, tuckedUnder = null) {
  const size = FURNITURE[kind];
  if (!insideRoom(rect, ctx.box)) return false;
  if (overlaps(rect, ctx.wardrobe)) return false;
  if (size.underlay) return true; // a rug may lie under furniture and in front of the doorway
  // A chair may be tucked under its own desk, never into anything else.
  if (ctx.placed.some((p) => p.id !== tuckedUnder && !FURNITURE[p.kind].underlay && overlaps(rect, p.rect))) return false;
  if (overlaps(rect, ctx.doorway)) return false;
  if (size.height > ctx.box.window.y0 && overlaps(rect, ctx.windowZone)) return false;
  if (ctx.avoidSwing && overlaps(rect, ctx.swing)) return false;
  return !ctx.eyes.some((eye) => blocksView(rect, size.height, eye, ctx.samples));
}

function candidates(box, kind, at, placed) {
  return at.flatMap((spot) => [...(spot.wall ? wallSpots(box, kind, spot) : relativeSpots(box, kind, spot, placed))]);
}

function placeGroup(item, ctx) {
  const tuckedUnder = item.at.find((spot) => spot.facing)?.facing ?? null;
  for (const spot of candidates(ctx.box, item.kind, item.at, ctx.placed)) {
    const rect = footprint(item.kind, spot.x, spot.z, spot.rotation);
    if (!valid(item.kind, rect, ctx, tuckedUnder)) continue;
    const piece = { id: item.id, kind: item.kind, ...spot, rect };
    const before = ctx.placed.length;
    ctx.placed.push(piece);
    let ok = true;
    for (const companion of item.with ?? []) {
      const placedCompanion = placeGroup(companion, ctx);
      if (!placedCompanion && !companion.optional) {
        ok = false;
        break;
      }
    }
    if (ok) return piece;
    ctx.placed.length = before; // the companion did not fit here: try the next spot
  }
  return null;
}

/**
 * Furniture for a preset in this room: { placed: [{ id, kind, x, z, rotation, rect }], omitted: [kind] }.
 * Deterministic. Prefers spots clear of the wardrobe's door swing (falls back without that wish).
 */
export function placeFurniture(design, room, presetId) {
  const box = roomBox(design, room);
  const preset = PRESETS[presetId] ?? PRESETS.couple;
  const widestDoor = Math.max(...design.compartments.map((c) => c.width));
  const base = {
    box,
    wardrobe: wardrobeFootprint(design),
    doorway: { x0: box.door.x0 - 100, x1: box.door.x1 + 100, z0: box.zFront - DOOR_CLEAR, z1: box.zFront },
    windowZone: { x0: box.x1 - 700, x1: box.x1, z0: box.window.z0 - 100, z1: box.window.z1 + 100 },
    swing: { x0: 0, x1: design.dimensions.width, z0: 0, z1: WARDROBE_FRONT + widestDoor },
    eyes: DOORWAY_STEPS.map((back) => doorwayEye(box, back)),
    samples: wardrobeSamples(design),
  };
  const placed = [];
  const omitted = [];
  for (const item of preset) {
    const ctx = { ...base, placed, avoidSwing: true };
    if (placeGroup(item, ctx)) continue;
    if (placeGroup(item, { ...ctx, avoidSwing: false })) continue;
    omitted.push(item.kind, ...(item.with ?? []).filter((c) => !c.optional).map((c) => c.kind));
  }
  return { placed, omitted, box };
}
