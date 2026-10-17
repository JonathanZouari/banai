// Partitions, shelves, drawers and rails, positioned from the canonical design.
// Interior y is measured from the top face of the bottom panel (frame.baseY above the floor);
// depths come from the frame (shelf line and partition front as in the manufacturing layout).
// A divider (shelf.fixed, docs/schema.md "Zones") is structural: it reaches the front like the
// partitions, where a zone door's joint lands on it. A drawer is one mesh, an open box behind its
// front panel, that slides out with its handle (pullOuts.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PULL_OUT_SHARE, asMover } from '../pullOuts.js';
import { VISUAL, toM } from '../units.js';
import { box, boxGeometry } from './frame.js';

// ASSUMPTION: visual-only drawer box sizes (mm), from P1. Not manufacturing specifications.
const DRAWER_FRONT = 18;
const DRAWER_WALL = 12; // sides and back
const DRAWER_BOTTOM = 8;
const DRAWER_RUNNER = 13; // runner space between the body and each side of the opening
const DRAWER_BODY_DROP = 30; // the body's top stays this far under the top of the front
const DRAWER_BODY_LIFT = 12; // ...and its bottom this far over the bottom of the front

export function buildPartitions(design, frame, material) {
  const { baseY, innerHeight, partitionDepth, partitionCenterZ, ranges } = frame;
  return design.partitions.map((partition, i) => box({
    size: [partition.thickness, innerHeight, partitionDepth],
    center: [ranges[i][1] + partition.thickness / 2, baseY + innerHeight / 2, partitionCenterZ],
    material,
    userData: { componentId: partition.id, kind: 'partition' },
  }));
}

/**
 * Drawer box parts relative to the drawer centre (mm): the full front panel, then the open body
 * behind it (two sides, a back and a bottom), set in for the runners. [[size, offset], ...]
 */
export function drawerParts([w, h, d]) {
  const lift = Math.min(DRAWER_BODY_LIFT, h * 0.1);
  const bodyHeight = h - lift - Math.min(DRAWER_BODY_DROP, h * 0.3);
  const bodyY = -h / 2 + lift + bodyHeight / 2;
  const bodyWidth = Math.max(w - 2 * DRAWER_RUNNER, 2 * DRAWER_WALL + 10);
  const bodyDepth = d - DRAWER_FRONT;
  const bodyZ = -d / 2 + bodyDepth / 2;
  const inner = bodyWidth - 2 * DRAWER_WALL;
  const sideX = bodyWidth / 2 - DRAWER_WALL / 2;
  return [
    [[w, h, DRAWER_FRONT], [0, 0, d / 2 - DRAWER_FRONT / 2]],
    [[DRAWER_WALL, bodyHeight, bodyDepth], [-sideX, bodyY, bodyZ]],
    [[DRAWER_WALL, bodyHeight, bodyDepth], [sideX, bodyY, bodyZ]],
    [[inner, bodyHeight, DRAWER_WALL], [0, bodyY, -d / 2 + DRAWER_WALL / 2]],
    [[inner, DRAWER_BOTTOM, bodyDepth - DRAWER_WALL], [0, bodyY - bodyHeight / 2 + DRAWER_BOTTOM / 2, bodyZ + DRAWER_WALL / 2]],
  ];
}

function drawerMesh({ size, center, material, userData }) {
  const geometry = mergeGeometries(drawerParts(size).map(([partSize, offset]) =>
    boxGeometry(partSize, offset, offset.map((v, i) => center[i] + v))));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...center.map(toM));
  // The merged geometry has no box parameters: the outer size (m) places the handle on the front.
  mesh.userData = { ...userData, size: size.map(toM) };
  return mesh;
}

export function buildCompartmentItems(design, frame, materials) {
  const carcassAppearance = design.carcass.appearance;
  const travel = toM(PULL_OUT_SHARE * frame.innerDepth);
  return design.compartments.flatMap((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const cx = (x0 + x1) / 2;
    const width = x1 - x0;
    const floor = frame.baseY;
    const shelves = compartment.shelves.map((shelf) => {
      const fixed = shelf.fixed === true;
      return box({
        size: [width, shelf.thickness, fixed ? frame.partitionDepth : frame.innerDepth],
        center: [cx, floor + shelf.y + shelf.thickness / 2, fixed ? frame.partitionCenterZ : frame.innerCenterZ],
        material: materials.forAppearance(shelf.appearance ?? carcassAppearance),
        userData: { componentId: shelf.id, kind: 'shelf', compartmentId: compartment.id, ...(fixed ? { fixed } : {}) },
      });
    });
    const drawers = compartment.drawers.map((drawer) => asMover(drawerMesh({
      size: [width - 2 * VISUAL.drawerGap, drawer.height - 2 * VISUAL.drawerGap, frame.innerDepth],
      center: [cx, floor + drawer.y + drawer.height / 2, frame.innerCenterZ],
      material: materials.forAppearance(drawer.appearance ?? carcassAppearance),
      userData: { componentId: drawer.id, kind: 'drawer', compartmentId: compartment.id },
    }), { type: 'slide', travel }));
    const rails = compartment.rails.map((rail) => {
      const geometry = new THREE.CylinderGeometry(toM(VISUAL.railRadius), toM(VISUAL.railRadius), toM(width), 16);
      geometry.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, materials.rail);
      mesh.position.set(toM(cx), toM(floor + rail.y), toM(frame.innerCenterZ));
      mesh.userData = { componentId: rail.id, kind: 'rail', compartmentId: compartment.id };
      return mesh;
    });
    return [...shelves, ...drawers, ...rails];
  });
}
