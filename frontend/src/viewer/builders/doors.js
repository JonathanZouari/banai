// Door panels, laid out exactly like the backend's manufacturing layout (backend/app/domain/
// layout.py), so the advisories and the carpenter PDF describe the doors drawn here:
// - hinged: on the carcass front (z > 0), full overlay. An end door's outer edge is the carcass
//   outer edge; between neighbours the edge is the middle of the partition. A DOOR_JOINT joint
//   (each edge inset by half of it); height H - plinth - joint from y = plinth + joint / 2. Two
//   leaves over one compartment are a split pair: the first in doors.items order takes the left half.
// - sliding: inside the carcass, between the side panels: (W - 2 panel + (n - 1) overlap) / n wide,
//   panel i at x = panel + i (width - overlap), standing on a 12 mm bottom guide over the bottom
//   panel and 4 mm under a 40 mm top track; odd panels run on the front track. The tracks are
//   drawn too (buildSlidingTracks), and the dossier's track depths (z) are used.
// Each door remembers what door motion needs (userData.closed, .hinge or .slide; metres).
// slide.width is the travel: one panel width minus the overlap, so an open panel sits exactly over its neighbour.
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

export const DOOR_JOINT = 3; // mm, layout.py DOOR_GAP
export const SLIDING_OVERLAP = 20; // mm, layout.py SLIDE_OVERLAP: neighbouring panels overlap so no gap shows [research 14]
export const SLIDE_TOP_TRACK = 40; // layout.py: top track under the top panel
export const SLIDE_BOTTOM_TRACK = 12; // layout.py: bottom guide over the bottom panel
export const SLIDE_CLEARANCE = 4; // layout.py: lift-out play between the panel and the tracks
const SLIDE_TRACK_BACK = { front: -30, back: -60 }; // dossier: back face of a panel on each track
const TRACK_PROFILE = { depth: 78, z: -43 }; // P1: one profile holding both tracks, 4 mm behind the front

const sameCompartment = (a, b) => a.compartmentIds.length === 1 && b.compartmentIds.length === 1 && a.compartmentIds[0] === b.compartmentIds[0];

/** Hinged door rectangles in mm: [{ door, x0, width, y0, height, z0, leaf }], leaf = 'left' | 'right' | null, z0 = back face. */
export function hingedDoorRects(design, frame) {
  const { compartments, partitions, doors } = design;
  const indexOf = new Map(compartments.map((compartment, i) => [compartment.id, i]));
  const last = compartments.length - 1;
  return doors.items.flatMap((door) => {
    const covered = door.compartmentIds.map((id) => indexOf.get(id));
    if (!covered.length || covered.some((i) => i === undefined)) return []; // never drawn from invalid data
    const [first, end] = [covered[0], covered.at(-1)];
    let left = first === 0 ? 0 : frame.ranges[first][0] - partitions[first - 1].thickness / 2;
    let right = end === last ? frame.width : frame.ranges[end][1] + partitions[end].thickness / 2;
    let leaf = null;
    const leaves = covered.length === 1 ? doors.items.filter((other) => sameCompartment(other, door)) : [];
    if (leaves.length === 2) {
      const middle = (left + right) / 2;
      leaf = leaves[0] === door ? 'left' : 'right';
      [left, right] = leaf === 'left' ? [left, middle] : [middle, right];
    }
    return [{
      door, leaf,
      x0: left + DOOR_JOINT / 2,
      width: right - left - DOOR_JOINT,
      y0: frame.plinth + DOOR_JOINT / 2,
      height: frame.height - frame.plinth - DOOR_JOINT,
      z0: 0, // on the carcass front
    }];
  });
}

/** Sliding panel rectangles in mm: [{ door, index, track, x0, width, y0, height, z0 }], z0 = back face. */
export function slidingDoorRects(design, frame) {
  const { items } = design.doors;
  const n = items.length;
  const width = (frame.width - 2 * frame.panel + (n - 1) * SLIDING_OVERLAP) / n;
  const y0 = frame.baseY + SLIDE_BOTTOM_TRACK;
  const height = frame.height - frame.panel - SLIDE_TOP_TRACK - y0 - SLIDE_CLEARANCE;
  return items.map((door, index) => {
    const track = index % 2 === 1 ? 'front' : 'back'; // as layout.py, also for three panels (the middle one in front)
    return {
      door, index, track, width, y0, height,
      x0: frame.panel + index * (width - SLIDING_OVERLAP),
      z0: SLIDE_TRACK_BACK[track],
    };
  });
}

/** The sliding system's top track and bottom guide (carcass parts, drawn with or without the doors). */
export function buildSlidingTracks(design, frame, materials) {
  if (design.doors.type !== 'sliding') return [];
  const width = frame.width - 2 * frame.panel;
  const track = (part, height, y) => box({
    size: [width, height, TRACK_PROFILE.depth],
    center: [frame.width / 2, y, TRACK_PROFILE.z],
    material: materials.metal,
    userData: { componentId: 'carcass', kind: 'carcass', part },
  });
  return [
    track('track-top', SLIDE_TOP_TRACK, frame.height - frame.panel - SLIDE_TOP_TRACK / 2),
    track('track-bottom', SLIDE_BOTTOM_TRACK, frame.baseY + SLIDE_BOTTOM_TRACK / 2),
  ];
}

/** Door rectangles (mm) for the design's door type; [] without doors. */
export function doorRects(design, frame) {
  if (design.doors.type === 'hinged') return hingedDoorRects(design, frame);
  if (design.doors.type === 'sliding' && design.doors.items.length) return slidingDoorRects(design, frame);
  return [];
}

function withMotion(mesh, extra) {
  mesh.userData.closed = { position: mesh.position.toArray(), rotationY: 0 };
  Object.assign(mesh.userData, extra);
  return mesh;
}

export function buildDoors(design, frame, materials) {
  const { doors } = design;
  const t = VISUAL.doorThickness;
  const materialOf = (door) => materials.forAppearance(door.appearance ?? doors.appearance);

  if (doors.type === 'hinged') {
    return hingedDoorRects(design, frame).map(({ door, leaf, x0, width, y0, height, z0 }) => {
      const mesh = box({
        size: [width, height, t],
        center: [x0 + width / 2, y0 + height / 2, z0 + t / 2],
        material: materialOf(door),
        userData: { componentId: door.id, kind: 'door', hingeSide: door.hingeSide, leaf },
      });
      // The hinge line is the back edge on the hinge side; door motion swings the leaf about it.
      const hingeX = toM(door.hingeSide === 'right' ? x0 + width : x0);
      return withMotion(mesh, { hinge: { x: hingeX, z: toM(z0) } });
    });
  }

  if (doors.type === 'sliding') {
    const rects = slidingDoorRects(design, frame);
    return rects.map(({ door, index, track, x0, width, y0, height, z0 }) => withMotion(box({
      size: [width, height, t],
      center: [x0 + width / 2, y0 + height / 2, z0 + t / 2],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door', track },
    }), { slide: { index, count: rects.length, width: toM(width - (rects.length > 1 ? SLIDING_OVERLAP : 0)) } }));
  }

  return [];
}
