// The room in 3D (ADR-037): a floor and the walls of the room's plan (domain/room.js), in the wardrobe's frame
// (x from its left outer face, z toward the front; the wall it stands on is the plane of the carcass back).
// Each wall is a slab WALL_THICKNESS thick, outside the plan's inner faces, with mitred corners. A wall between
// the camera and the room fades (a cut-away), so the room never hides the wardrobe. Visual only: never picked,
// never casts a shadow, hidden in renders and video with the rest of the room overlay (room.js).
//
// Openings (stage 3) are cut out of their wall: the slab is built in pieces (full height between openings, and
// below and above each one), all merged into the wall's one mesh, so the mitres and the cut-away stay as they
// were. A door gets a plain leaf standing ajar on its hinges, a window a frame and a pane; a passage stays open.
// They fade with their wall.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { openingBottom, roomCorners, roomWalls, toWardrobe } from '../domain/room.js';
import { toM } from './units.js';

export const WALL_THICKNESS = 100; // mm
export const DEFAULT_ROOM_HEIGHT = 2600; // mm, without a measured ceiling
export const FADED_OPACITY = 0.12;
export const LEAF_THICKNESS = 40; // mm, a plain door leaf
export const LEAF_AJAR = Math.PI / 6; // how far the drawn leaf stands open
const FRAME = 50; // mm, a window frame's face
const FRAME_DEPTH = 60; // mm

/** The walls' height: the measured ceiling, else 2.6 m (never lower than the wardrobe and a little air). */
export function roomHeight(design) {
  return design.site?.ceiling ?? Math.max(DEFAULT_ROOM_HEIGHT, design.dimensions.height + 200);
}

/** Where two lines meet: p + a u and q + b v (null when parallel). */
function meet(p, u, q, v) {
  const denom = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(denom) < 1e-9) return null;
  const a = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / denom;
  return [p[0] + u[0] * a, p[1] + u[1] * a];
}

/**
 * The walls' footprints on the plan (mm): for wall i, [inner start, inner end, outer end, outer start], the
 * outer corners mitred where the walls' outer faces meet.
 */
export function wallFootprints(shape, thickness = WALL_THICKNESS) {
  const pts = roomCorners(shape);
  const count = pts.length;
  const dirs = pts.map((p, i) => {
    const q = pts[(i + 1) % count];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
  });
  // The outer face of wall i: its inner line moved out (against the inward normal [-u.y, u.x]).
  const outer = dirs.map((u, i) => [pts[i][0] + u[1] * thickness, pts[i][1] - u[0] * thickness]);
  const outerCorner = (i) => { // where the outer faces of walls i - 1 and i meet
    const prev = (i - 1 + count) % count;
    return meet(outer[prev], dirs[prev], outer[i], dirs[i]) ?? outer[i];
  };
  return pts.map((p, i) => [p, pts[(i + 1) % count], outerCorner((i + 1) % count), outerCorner(i)]);
}

/** The part of a convex polygon where (p - origin) . normal >= 0 (one Sutherland-Hodgman step). */
function clip(poly, normal, origin) {
  const side = poly.map((p) => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1]);
  const out = [];
  poly.forEach((p, i) => {
    const j = (i + 1) % poly.length;
    if (side[i] >= 0) out.push(p);
    if (side[i] * side[j] < 0) { // a strict crossing (a vertex on the line is kept once, above)
      const t = side[i] / (side[i] - side[j]);
      out.push([p[0] + (poly[j][0] - p[0]) * t, p[1] + (poly[j][1] - p[1]) * t]);
    }
  });
  return out;
}

/**
 * Wall `index`'s slab cut around its openings: [{ poly, y0, y1 }], each a plan polygon (mm) standing from y0 to
 * y1 above the floor. The pieces between openings keep the mitred ends; an opening leaves a piece below it (a
 * window's sill) and one above it, up to `height`.
 */
export function wallPieces(shape, index, openings, height, thickness = WALL_THICKNESS) {
  const footprint = wallFootprints(shape, thickness)[index];
  const { start, end, length } = roomWalls(shape)[index];
  const u = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const at = (along) => [start[0] + u[0] * along, start[1] + u[1] * along];
  const between = (a, b) => { // the footprint from `along` a to b (either may be open-ended)
    let poly = footprint;
    if (a !== null) poly = clip(poly, u, at(a));
    if (b !== null && poly.length) poly = clip(poly, [-u[0], -u[1]], at(b));
    return poly.length > 2 ? poly : null;
  };
  const cuts = openings.filter((o) => o.wall === index).sort((p, q) => p.at - q.at);
  const pieces = [];
  let from = null;
  for (const o of cuts) {
    const bottom = Math.min(openingBottom(o), height);
    const top = Math.min(bottom + o.height, height);
    if (top <= bottom) continue; // above the walls drawn: nothing to cut
    const solid = between(from, o.at);
    if (solid) pieces.push({ poly: solid, y0: 0, y1: height });
    const gap = between(o.at, o.at + o.width);
    if (gap && bottom > 0) pieces.push({ poly: gap, y0: 0, y1: bottom });
    if (gap && top < height) pieces.push({ poly: gap, y0: top, y1: height });
    from = o.at + o.width;
  }
  const rest = between(from, null);
  if (rest) pieces.push({ poly: rest, y0: 0, y1: height });
  return pieces;
}

/** A flat outline (mm, in the wardrobe's frame) as a three.js shape lying on the floor once rotated. */
const shapeOf = (points) => new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(toM(x), toM(-z))));

/** A box `length` x `height` x `depth` (mm) centred on plan point `centre` (wardrobe frame), along unit `dir`. */
function boxAlong(material, centre, dir, length, height, depth, y) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(toM(length), toM(height), toM(depth)), material);
  mesh.position.set(toM(centre[0]), toM(y + height / 2), toM(centre[1]));
  mesh.rotation.y = -Math.atan2(dir[1], dir[0]);
  return mesh;
}

/** The door leaf, or the window frame and pane, of one opening (meshes in the wardrobe's frame). */
function openingParts(design, opening, height, materials) {
  const { start, end, length } = roomWalls(design.room.shape)[opening.wall];
  const u = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const n = [-u[1], u[0]]; // into the room
  const plan = (along, into) => [start[0] + u[0] * along + n[0] * into, start[1] + u[1] * along + n[1] * into];
  const local = (p) => toWardrobe(design, p);
  const dirOf = (a, b) => { // a unit direction in the wardrobe's frame, from plan points a to b
    const [p, q] = [local(a), local(b)];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
  };
  const bottom = openingBottom(opening);
  const top = Math.min(bottom + opening.height, height);
  if (top <= bottom || opening.type === 'passage') return [];
  if (opening.type === 'door') {
    const left = opening.hinge === 'left'; // seen from inside the room, where the wall's start is on the left
    const out = opening.swing === 'out';
    const hinge = plan(left ? opening.at : opening.at + opening.width, out ? -WALL_THICKNESS : 0);
    const closed = dirOf(hinge, plan(left ? opening.at + 1 : opening.at + opening.width - 1, out ? -WALL_THICKNESS : 0));
    const open = dirOf(hinge, plan(left ? opening.at : opening.at + opening.width, out ? -WALL_THICKNESS - 1 : 1));
    const [c, s] = [Math.cos(LEAF_AJAR), Math.sin(LEAF_AJAR)];
    const dir = [closed[0] * c + open[0] * s, closed[1] * c + open[1] * s];
    const h = local(hinge);
    const leafLength = opening.width - 10;
    const centre = [h[0] + dir[0] * leafLength / 2, h[1] + dir[1] * leafLength / 2];
    const material = new THREE.MeshStandardMaterial({ color: '#c8a77f', roughness: 0.7, transparent: true, opacity: 1 });
    materials.push(material);
    const leaf = boxAlong(material, centre, dir, leafLength, top - bottom - 10, LEAF_THICKNESS, bottom);
    leaf.name = 'room-door';
    return [leaf];
  }
  // A window: a frame at the wall's middle, and a pane. One too low for its frame (a sill just under the walls' top) gets none.
  if (top - bottom < 2 * FRAME + 1) return [];
  const frameMaterial = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.6, transparent: true, opacity: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: '#bcd6e4', roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
  glass.userData.opacity = 0.35;
  materials.push(frameMaterial, glass);
  const mid = -WALL_THICKNESS / 2;
  const dir = dirOf(plan(opening.at, mid), plan(opening.at + opening.width, mid));
  const centreAt = (along) => local(plan(along, mid));
  const w = opening.width;
  const parts = [
    boxAlong(frameMaterial, centreAt(opening.at + w / 2), dir, w, FRAME, FRAME_DEPTH, bottom),
    boxAlong(frameMaterial, centreAt(opening.at + w / 2), dir, w, FRAME, FRAME_DEPTH, top - FRAME),
    boxAlong(frameMaterial, centreAt(opening.at + FRAME / 2), dir, FRAME, top - bottom, FRAME_DEPTH, bottom),
    boxAlong(frameMaterial, centreAt(opening.at + w - FRAME / 2), dir, FRAME, top - bottom, FRAME_DEPTH, bottom),
    boxAlong(glass, centreAt(opening.at + w / 2), dir, w - 2 * FRAME, top - bottom - 2 * FRAME, 6, bottom + FRAME),
  ];
  parts.forEach((part) => { part.name = 'room-window'; });
  return parts;
}

/** The room's floor and walls as one group, or null without a room. dispose() frees its geometry and materials. */
export function buildWalls(design) {
  if (!design.room) return null;
  const group = new THREE.Group();
  group.name = 'room-walls';
  const heightMm = roomHeight(design);
  const height = toM(heightMm);
  const local = (p) => toWardrobe(design, p);
  const materials = [];
  const openings = design.room.openings ?? [];

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#e8dccb', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  materials.push(floorMaterial);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(roomCorners(design.room.shape).map(local))), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = toM(0.5);
  floor.receiveShadow = true;
  floor.name = 'room-floor';
  group.add(floor);

  wallFootprints(design.room.shape).forEach((footprint, i) => {
    const material = new THREE.MeshStandardMaterial({ color: '#f1ebe2', roughness: 0.95, transparent: true, opacity: 1 });
    materials.push(material);
    const pieces = wallPieces(design.room.shape, i, openings, heightMm).map(({ poly, y0, y1 }) => {
      const piece = new THREE.ExtrudeGeometry(shapeOf(poly.map(local)), { depth: toM(y1 - y0), bevelEnabled: false });
      piece.translate(0, 0, toM(y0));
      return piece;
    });
    const geometry = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false);
    if (pieces.length > 1) pieces.forEach((piece) => piece.dispose());
    const wall = new THREE.Mesh(geometry, material);
    wall.rotation.x = -Math.PI / 2;
    wall.name = `room-wall-${i}`;
    wall.receiveShadow = true;
    // Its inner face's middle and the normal into the room, in the group's frame, for the cut-away.
    const [a, b] = [local(footprint[0]), local(footprint[1])];
    const along = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
    wall.userData.face = new THREE.Vector3(toM((a[0] + b[0]) / 2), height / 2, toM((a[1] + b[1]) / 2));
    wall.userData.inward = new THREE.Vector3(-along.z, 0, along.x);
    // Its doors and windows fade with it.
    wall.userData.parts = openings.flatMap((o, k) => (o.wall === i ? openingParts(design, o, heightMm, materials)
      .map((part) => Object.assign(part, { name: `${part.name}-${k}` })) : []));
    wall.onBeforeRender = (renderer, scene, camera) => fade(wall, camera);
    group.add(wall);
    wall.userData.parts.forEach((part) => {
      part.onBeforeRender = (renderer, scene, camera) => fade(wall, camera);
      group.add(part);
    });
  });

  group.traverse((node) => {
    node.raycast = () => {}; // never picked
    node.castShadow = false;
  });
  group.userData.dispose = () => {
    group.traverse((node) => node.geometry?.dispose());
    materials.forEach((material) => material.dispose());
  };
  return group;
}

/** Fade `wall` (and its doors and windows) when the camera is behind it. Returns whether it faded. */
function fade(wall, camera) {
  const face = wall.userData.face.clone().applyMatrix4(wall.parent?.matrixWorld ?? new THREE.Matrix4());
  const inward = wall.userData.inward.clone().transformDirection(wall.parent?.matrixWorld ?? new THREE.Matrix4());
  const outside = camera.getWorldPosition(new THREE.Vector3()).sub(face).dot(inward) < 0;
  wall.material.opacity = outside ? FADED_OPACITY : 1;
  wall.material.depthWrite = !outside;
  for (const part of wall.userData.parts ?? []) {
    const base = part.material.userData.opacity ?? 1;
    part.material.opacity = outside ? Math.min(base, FADED_OPACITY) : base;
    if (base === 1) part.material.depthWrite = !outside;
  }
  return outside;
}

/** Apply the cut-away for `camera` to every wall now (each wall also does it before it is drawn). Faded indices. */
export function cutAway(group, camera) {
  if (!group) return [];
  group.updateMatrixWorld(true);
  return group.children.filter((wall) => wall.userData.inward && fade(wall, camera)).map((wall) => Number(wall.name.split('-').pop()));
}
