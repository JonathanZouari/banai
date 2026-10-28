// Door panels in front of the carcass (z > 0).
// - Hinged doors span the x-range of the compartments they cover, with a handle on the
//   side opposite the hinge.
// - Sliding panels overlap their neighbours and alternate between two tracks (back, front),
//   between a top and a bottom rail, each with a vertical pull handle.
// Handles and rails are visual hardware only: they are not selectable, and never part of the design.
import * as THREE from 'three';
import { VISUAL } from '../units.js';
import { box } from './frame.js';

const noRaycast = () => {};

function hardware(args, part) {
  const mesh = box({ ...args, userData: { kind: 'hardware', part } });
  mesh.raycast = noRaycast; // clicks pass through to the door behind
  return mesh;
}

/** A thin outline around a door panel. Not selectable; only there to separate panels. */
function outline(panel, materials) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(panel.geometry), materials.doorEdge);
  lines.position.copy(panel.position);
  lines.userData = { kind: 'hardware', part: 'edge' };
  lines.raycast = noRaycast;
  return lines;
}

/** A vertical handle with its centre x, on a panel whose front face is at frontZ. */
function handle(x, frontZ, panelY, panelHeight, materials) {
  const length = Math.min(VISUAL.handleLength, panelHeight * 0.4);
  const halfSpan = panelHeight / 2 - length / 2 - 20;
  // Aim for the usual grip height; stay inside the panel for short wardrobes.
  const y = Math.min(Math.max(VISUAL.handleHeightFromFloor, panelY - halfSpan), panelY + halfSpan);
  return hardware({
    size: [VISUAL.handleWidth, length, VISUAL.handleDepth],
    center: [x, y, frontZ + VISUAL.handleDepth / 2],
    material: materials.hardware,
  }, 'handle');
}

function withOpening(objects, opening) {
  objects.forEach((object) => { object.userData.opening = opening; });
  return objects;
}

function buildHinged(design, frame, materials, { t, gap, y, height, faceOf }) {
  const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
  return design.doors.items.flatMap((door) => {
    const x0 = rangeOf.get(door.compartmentIds[0])[0];
    const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
    const panel = box({
      size: [x1 - x0 - 2 * gap, height, t],
      center: [(x0 + x1) / 2, y, t / 2],
      material: faceOf(door, x1 - x0 - 2 * gap, height),
      userData: { componentId: door.id, kind: 'door', hingeSide: door.hingeSide },
    });
    // The handle sits on the free edge, opposite the hinge.
    const freeEdgeX = door.hingeSide === 'right' ? x0 + gap + VISUAL.handleInset : x1 - gap - VISUAL.handleInset;
    // "Doors open" (view only): swing outward around the hinge edge on the panel's back face.
    const opening = door.hingeSide === 'right'
      ? { type: 'hinge', pivot: [x1 - gap, 0], sign: 1 }
      : { type: 'hinge', pivot: [x0 + gap, 0], sign: -1 };
    return withOpening([panel, outline(panel, materials), handle(freeEdgeX, t, y, height, materials)], opening);
  });
}

function buildSliding(design, frame, materials, { t, gap, y, height, faceOf }) {
  const count = design.doors.items.length;
  const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
  const panelWidth = (frame.innerWidth + (count - 1) * overlap) / count;
  const step = panelWidth - overlap;
  const backZ = t / 2;
  const frontZ = t * 1.5 + VISUAL.slidingTrackGap;
  const inset = VISUAL.handleInset;

  const parts = design.doors.items.flatMap((door, i) => {
    const x0 = frame.panel + i * step;
    const onFront = i % 2 === 1;
    const z = onFront ? frontZ : backZ;
    const panel = box({
      size: [panelWidth, height, t],
      center: [x0 + panelWidth / 2, y, z],
      material: faceOf(door, panelWidth, height),
      userData: { componentId: door.id, kind: 'door' },
    });
    // The handle sits where it is not hidden by a panel in front. The last panel (and, for a
    // single panel, none) has its handle on the side facing the neighbour it slides over.
    const isLast = i === count - 1;
    let handleX;
    if (count === 1) handleX = x0 + panelWidth - inset;
    else if (isLast) handleX = x0 + (onFront ? 0 : overlap) + inset;
    else handleX = x0 + panelWidth - (onFront ? 0 : overlap) - inset;
    // "Doors open" (view only): every panel slides over the first one; panels sharing a track are
    // nudged forward a little so their faces never coincide.
    const opening = { type: 'slide', dx: -i * step, dz: Math.floor(i / 2) * 1.5 };
    return withOpening([panel, outline(panel, materials), handle(handleX, z + t / 2, y, height, materials)], opening);
  });

  // Top and bottom rails span both tracks, like the aluminium frame of a sliding wardrobe.
  const railDepth = frontZ + t / 2 + 4;
  const railHeight = VISUAL.slidingRailHeight;
  const railBox = (railY, part) => hardware({
    size: [frame.innerWidth, railHeight, railDepth],
    center: [frame.panel + frame.innerWidth / 2, railY, railDepth / 2 - 2],
    material: materials.hardware,
  }, part);
  const top = frame.panel + frame.innerHeight - railHeight / 2;
  const bottom = frame.panel + railHeight / 2;
  return [...parts, railBox(top, 'rail-top'), railBox(bottom, 'rail-bottom')];
}

// BoxGeometry material groups: +x, -x, +y, -y, +z (front), -z.
const FRONT_FACE = 4;

export function buildDoors(design, frame, materials, printFor = null) {
  const { doors } = design;
  const materialOf = (door) => materials.forAppearance(door.appearance ?? doors.appearance);
  /** The panel material: the door finish, with the printed image on the front face if any. */
  const faceOf = (door, width, height) => {
    const base = materialOf(door);
    const print = printFor?.(door.id, width, height, base);
    if (!print) return base;
    const faces = Array(6).fill(base);
    faces[FRONT_FACE] = print;
    return faces;
  };
  const context = {
    faceOf,
    t: VISUAL.doorThickness,
    gap: VISUAL.doorGap,
    y: frame.panel + frame.innerHeight / 2,
    height: frame.innerHeight - 2 * VISUAL.doorGap,
    materialOf,
  };
  if (doors.type === 'hinged') return buildHinged(design, frame, materials, context);
  if (doors.type === 'sliding') return buildSliding(design, frame, materials, context);
  return [];
}
