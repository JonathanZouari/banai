// Door panels in front of the carcass (z > 0).
// - Hinged doors span the x-range of the compartments they cover, with a handle on the
//   side opposite the hinge.
// - Sliding panels overlap their neighbours and alternate between two tracks (back, front),
//   between a top and a bottom rail, each with a vertical pull handle.
// Handles and rails are visual hardware only: they are not selectable, and never part of the design.
// Interior view opens the doors instead of removing them: every door part records its closed
// pose and how it moves (userData.motion), and poseDoors() places it for an amount 0..1.
// - Hinged: the panel, its outline and handle rotate together about the hinge edge.
// - Sliding: the panels already fill the width, so they cannot move aside; they turn
//   translucent instead and their handles hide.
import * as THREE from 'three';
import { VISUAL, toM } from '../units.js';
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

/** Record each part's closed pose and its motion, so poseDoors() can place it later. */
function withMotion(parts, motion) {
  parts.forEach((part) => {
    part.userData.motion = motion;
    part.userData.closedPosition = part.position.clone();
  });
  return parts;
}

function buildHinged(design, frame, materials, { t, gap, y, height, materialOf }) {
  const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
  const spanOf = (door) => [rangeOf.get(door.compartmentIds[0])[0], rangeOf.get(door.compartmentIds.at(-1))[1]];
  const hingeXOf = (door) => spanOf(door)[door.hingeSide === 'right' ? 1 : 0];
  // Two doors hinged on the same partition stop at 90 degrees, side by side; past that they would cross.
  const hingeXs = design.doors.items.map(hingeXOf);
  const sharesHinge = (x) => hingeXs.filter((other) => Math.abs(other - x) <= 2 * frame.panel + 2 * gap).length > 1;
  return design.doors.items.flatMap((door) => {
    const [x0, x1] = spanOf(door);
    const openAngle = sharesHinge(hingeXOf(door)) ? 90 : VISUAL.doorOpenAngle;
    const panel = box({
      size: [x1 - x0 - 2 * gap, height, t],
      center: [(x0 + x1) / 2, y, t / 2],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door', hingeSide: door.hingeSide },
      rounded: true,
    });
    // The handle sits on the free edge, opposite the hinge.
    const right = door.hingeSide === 'right';
    const freeEdgeX = right ? x0 + gap + VISUAL.handleInset : x1 - gap - VISUAL.handleInset;
    // The hinge axis runs along the panel's outer edge on the hinge side, at its front face.
    // A left hinge opens with a negative rotation about y (the free edge comes forward).
    const motion = {
      type: 'hinge',
      pivot: new THREE.Vector3(toM(right ? x1 - gap : x0 + gap), 0, toM(t)),
      angle: THREE.MathUtils.degToRad(openAngle) * (right ? 1 : -1),
    };
    return withMotion([panel, outline(panel, materials), handle(freeEdgeX, t, y, height, materials)], motion);
  });
}

function buildSliding(design, frame, materials, { t, gap, y, height, materialOf }) {
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
    // Each sliding panel gets its own material copy so it can fade on its own; disposeWardrobe
    // frees it (ownsMaterial). The shared cached material is never made transparent.
    const material = materialOf(door).clone();
    material.transparent = true;
    const panel = box({
      size: [panelWidth, height, t],
      center: [x0 + panelWidth / 2, y, z],
      material,
      userData: { componentId: door.id, kind: 'door', ownsMaterial: true },
      rounded: true,
    });
    // The handle sits where it is not hidden by a panel in front. The last panel (and, for a
    // single panel, none) has its handle on the side facing the neighbour it slides over.
    const isLast = i === count - 1;
    let handleX;
    if (count === 1) handleX = x0 + panelWidth - inset;
    else if (isLast) handleX = x0 + (onFront ? 0 : overlap) + inset;
    else handleX = x0 + panelWidth - (onFront ? 0 : overlap) - inset;
    const motion = { type: 'fade' };
    return withMotion([panel, outline(panel, materials), handle(handleX, z + t / 2, y, height, materials)], motion);
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

const rotation = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);

/**
 * Place every door part for an opening amount (0 = closed, 1 = fully open). Pure with
 * respect to the design: it only moves meshes already in the group, from their closed pose.
 */
export function poseDoors(group, amount) {
  const a = Math.min(1, Math.max(0, amount));
  group.children.forEach((part) => {
    const { motion, closedPosition } = part.userData;
    if (!motion) return;
    if (motion.type === 'hinge') {
      const angle = motion.angle * a;
      rotation.setFromAxisAngle(yAxis, angle);
      part.position.copy(closedPosition).sub(motion.pivot).applyQuaternion(rotation).add(motion.pivot);
      part.rotation.set(0, angle, 0);
    } else if (part.userData.kind === 'door') {
      part.material.opacity = 1 - (1 - VISUAL.slidingOpenOpacity) * a;
      part.material.depthWrite = a === 0; // translucent panels must not hide what is behind them
      part.castShadow = a < 0.5;
    } else {
      part.visible = a < 0.5; // outline and handle of a translucent panel would float in the air
    }
  });
  return group;
}

export function buildDoors(design, frame, materials) {
  const { doors } = design;
  const context = {
    t: VISUAL.doorThickness,
    gap: VISUAL.doorGap,
    y: frame.panel + frame.innerHeight / 2,
    height: frame.innerHeight - 2 * VISUAL.doorGap,
    materialOf: (door) => materials.forAppearance(door.appearance ?? doors.appearance),
  };
  if (doors.type === 'hinged') return buildHinged(design, frame, materials, context);
  if (doors.type === 'sliding') return buildSliding(design, frame, materials, context);
  return [];
}
