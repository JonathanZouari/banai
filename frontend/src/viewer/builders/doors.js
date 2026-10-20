// Door panels in front of the carcass (z > 0).
// - Hinged doors span the x-range of the compartments they cover, with a handle on the
//   side opposite the hinge.
// - Sliding panels overlap their neighbours and alternate between two tracks (back, front),
//   between a top and a bottom rail, each with a vertical pull handle.
// Handles follow the design's handle style and finish (one for all doors; style `none` draws none).
// A door with a mirror front gets a mirror pane inset in its panel; the pane selects its door.
// Handles and rails are visual hardware: they are not selectable.
import * as THREE from 'three';
import { MM_TO_M, toM, VISUAL } from '../units.js';
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

// Grip length per style (mm); the panel's share caps it on short doors.
const HANDLE_LENGTH = Object.freeze({ bar: [VISUAL.handleLength, 0.4], long_bar: [VISUAL.longHandleLength, 0.7], edge_pull: [VISUAL.edgePullLength, 0.3] });

/** How far a style's handle sits from the panel's free edge. */
export const handleInset = (style) => (style === 'edge_pull' ? VISUAL.edgePullInset : VISUAL.handleInset);

/** The design's handle, centred at x on a panel whose front face is at frontZ (null for style `none`). */
function handle(x, frontZ, panelY, panelHeight, { style, material }) {
  if (style === 'none') return null;
  // Aim for the usual grip height; stay inside the panel for short wardrobes.
  const grip = (length) => {
    const halfSpan = Math.max(0, panelHeight / 2 - length / 2 - 20);
    return Math.min(Math.max(VISUAL.handleHeightFromFloor, panelY - halfSpan), panelY + halfSpan);
  };
  if (style === 'knob') {
    const { knobRadius: r, knobDepth: depth } = VISUAL;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(toM(r), toM(r * 0.8), toM(depth), 24), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(toM(x), toM(grip(2 * r)), toM(frontZ + depth / 2));
    mesh.userData = { kind: 'hardware', part: 'handle', style };
    mesh.raycast = noRaycast;
    return mesh;
  }
  const [maxLength, share] = HANDLE_LENGTH[style] ?? HANDLE_LENGTH.bar;
  const length = Math.min(maxLength, panelHeight * share);
  const [width, depth] = style === 'edge_pull' ? [VISUAL.edgePullWidth, VISUAL.edgePullDepth] : [VISUAL.handleWidth, VISUAL.handleDepth];
  const mesh = hardware({ size: [width, length, depth], center: [x, grip(length), frontZ + depth / 2], material }, 'handle');
  mesh.userData.style = style;
  return mesh;
}

/** A mirror pane inset in a door panel's front face; clicking it selects the door. */
function mirrorPane(panel, door, frontZ, materials) {
  const { x, y } = panel.position;
  const { width, height } = panel.geometry.parameters; // metres
  const inset = VISUAL.mirrorInset;
  return box({
    size: [width / MM_TO_M - 2 * inset, height / MM_TO_M - 2 * inset, VISUAL.mirrorThickness],
    center: [x / MM_TO_M, y / MM_TO_M, frontZ + VISUAL.mirrorThickness / 2],
    material: materials.mirror,
    userData: { componentId: door.id, kind: 'mirror' },
  });
}

/** Panel, outline, optional mirror pane and optional handle for one door. */
function doorParts(panel, door, frontZ, handleX, context, materials) {
  return [
    panel,
    outline(panel, materials),
    ...(door.front === 'mirror' ? [mirrorPane(panel, door, frontZ, materials)] : []),
    handle(handleX, frontZ + (door.front === 'mirror' ? VISUAL.mirrorThickness : 0), panel.position.y / MM_TO_M, context.height, context.handles),
  ].filter(Boolean);
}

function buildHinged(design, frame, materials, context) {
  const { t, gap, y, height, materialOf } = context;
  const rangeOf = new Map(design.compartments.map((c, i) => [c.id, frame.ranges[i]]));
  return design.doors.items.flatMap((door) => {
    const x0 = rangeOf.get(door.compartmentIds[0])[0];
    const x1 = rangeOf.get(door.compartmentIds.at(-1))[1];
    const panel = box({
      size: [x1 - x0 - 2 * gap, height, t],
      center: [(x0 + x1) / 2, y, t / 2],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door', hingeSide: door.hingeSide },
    });
    // The handle sits on the free edge, opposite the hinge.
    const inset = handleInset(context.handles.style);
    const freeEdgeX = door.hingeSide === 'right' ? x0 + gap + inset : x1 - gap - inset;
    return doorParts(panel, door, t, freeEdgeX, context, materials);
  });
}

function buildSliding(design, frame, materials, context) {
  const { t, y, height, materialOf } = context;
  const count = design.doors.items.length;
  const overlap = count > 1 ? VISUAL.slidingOverlap : 0;
  const panelWidth = (frame.innerWidth + (count - 1) * overlap) / count;
  const step = panelWidth - overlap;
  const backZ = t / 2;
  const frontZ = t * 1.5 + VISUAL.slidingTrackGap;
  const inset = handleInset(context.handles.style);

  const parts = design.doors.items.flatMap((door, i) => {
    const x0 = frame.panel + i * step;
    const onFront = i % 2 === 1;
    const z = onFront ? frontZ : backZ;
    const panel = box({
      size: [panelWidth, height, t],
      center: [x0 + panelWidth / 2, y, z],
      material: materialOf(door),
      userData: { componentId: door.id, kind: 'door' },
    });
    // The handle sits where it is not hidden by a panel in front. The last panel (and, for a
    // single panel, none) has its handle on the side facing the neighbour it slides over.
    const isLast = i === count - 1;
    let handleX;
    if (count === 1) handleX = x0 + panelWidth - inset;
    else if (isLast) handleX = x0 + (onFront ? 0 : overlap) + inset;
    else handleX = x0 + panelWidth - (onFront ? 0 : overlap) - inset;
    return doorParts(panel, door, z + t / 2, handleX, context, materials);
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

export function buildDoors(design, frame, materials) {
  const { doors } = design;
  const context = {
    t: VISUAL.doorThickness,
    gap: VISUAL.doorGap,
    y: frame.panel + frame.innerHeight / 2,
    height: frame.innerHeight - 2 * VISUAL.doorGap,
    materialOf: (door) => materials.forAppearance(door.appearance ?? doors.appearance),
    handles: { style: doors.handles.style, material: materials.handle(doors.handles.finish) },
  };
  if (doors.type === 'hinged') return buildHinged(design, frame, materials, context);
  if (doors.type === 'sliding') return buildSliding(design, frame, materials, context);
  return [];
}
