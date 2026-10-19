// The room in 3D (ADR-037): a floor and the walls of the room's plan (domain/room.js), in the wardrobe's frame
// (x from its left outer face, z toward the front; the wall it stands on is the plane of the carcass back).
// Each wall is a slab WALL_THICKNESS thick, outside the plan's inner faces, with mitred corners. A wall between
// the camera and the room fades (a cut-away), so the room never hides the wardrobe. Visual only: never picked,
// never casts a shadow, hidden in renders and video with the rest of the room overlay (room.js).
import * as THREE from 'three';
import { roomCorners, toWardrobe } from '../domain/room.js';
import { toM } from './units.js';

export const WALL_THICKNESS = 100; // mm
export const DEFAULT_ROOM_HEIGHT = 2600; // mm, without a measured ceiling
export const FADED_OPACITY = 0.12;

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

/** A flat outline (mm, in the wardrobe's frame) as a three.js shape lying on the floor once rotated. */
const shapeOf = (points) => new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(toM(x), toM(-z))));

/** The room's floor and walls as one group, or null without a room. dispose() frees its geometry and materials. */
export function buildWalls(design) {
  if (!design.room) return null;
  const group = new THREE.Group();
  group.name = 'room-walls';
  const height = toM(roomHeight(design));
  const local = (p) => toWardrobe(design, p);
  const materials = [];

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
    const geometry = new THREE.ExtrudeGeometry(shapeOf(footprint.map(local)), { depth: height, bevelEnabled: false });
    const wall = new THREE.Mesh(geometry, material);
    wall.rotation.x = -Math.PI / 2;
    wall.name = `room-wall-${i}`;
    wall.receiveShadow = true;
    // Its inner face's middle and the normal into the room, in the group's frame, for the cut-away.
    const [a, b] = [local(footprint[0]), local(footprint[1])];
    const along = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
    wall.userData.face = new THREE.Vector3(toM((a[0] + b[0]) / 2), height / 2, toM((a[1] + b[1]) / 2));
    wall.userData.inward = new THREE.Vector3(-along.z, 0, along.x);
    wall.onBeforeRender = (renderer, scene, camera) => fade(wall, camera);
    group.add(wall);
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

/** Fade `wall` when the camera is behind it (outside the room, looking through it). Returns whether it faded. */
function fade(wall, camera) {
  const face = wall.userData.face.clone().applyMatrix4(wall.parent?.matrixWorld ?? new THREE.Matrix4());
  const inward = wall.userData.inward.clone().transformDirection(wall.parent?.matrixWorld ?? new THREE.Matrix4());
  const outside = camera.getWorldPosition(new THREE.Vector3()).sub(face).dot(inward) < 0;
  wall.material.opacity = outside ? FADED_OPACITY : 1;
  wall.material.depthWrite = !outside;
  return outside;
}

/** Apply the cut-away for `camera` to every wall now (each wall also does it before it is drawn). Faded indices. */
export function cutAway(group, camera) {
  if (!group) return [];
  group.updateMatrixWorld(true);
  return group.children.filter((wall) => wall.userData.inward && fade(wall, camera)).map((wall) => Number(wall.name.split('-').pop()));
}
