// Partitions, shelves, drawers and rails, positioned from the canonical design.
// Interior y is measured from the top face of the bottom panel (frame.baseY above the floor);
// depths come from the frame (shelf line and partition front as in the manufacturing layout).
import * as THREE from 'three';
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

export function buildPartitions(design, frame, material) {
  const { baseY, innerHeight, partitionDepth, partitionCenterZ, ranges } = frame;
  return design.partitions.map((partition, i) => box({
    size: [partition.thickness, innerHeight, partitionDepth],
    center: [ranges[i][1] + partition.thickness / 2, baseY + innerHeight / 2, partitionCenterZ],
    material,
    userData: { componentId: partition.id, kind: 'partition' },
  }));
}

export function buildCompartmentItems(design, frame, materials) {
  const carcassAppearance = design.carcass.appearance;
  return design.compartments.flatMap((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const cx = (x0 + x1) / 2;
    const width = x1 - x0;
    const floor = frame.baseY;
    const shelves = compartment.shelves.map((shelf) => box({
      size: [width, shelf.thickness, frame.innerDepth],
      center: [cx, floor + shelf.y + shelf.thickness / 2, frame.innerCenterZ],
      material: materials.forAppearance(shelf.appearance ?? carcassAppearance),
      userData: { componentId: shelf.id, kind: 'shelf', compartmentId: compartment.id },
    }));
    const drawers = compartment.drawers.map((drawer) => box({
      size: [width - 2 * VISUAL.drawerGap, drawer.height - 2 * VISUAL.drawerGap, frame.innerDepth],
      center: [cx, floor + drawer.y + drawer.height / 2, frame.innerCenterZ],
      material: materials.forAppearance(drawer.appearance ?? carcassAppearance),
      userData: { componentId: drawer.id, kind: 'drawer', compartmentId: compartment.id },
    }));
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
