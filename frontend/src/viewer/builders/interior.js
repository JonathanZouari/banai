// Partitions, shelves, drawers and rails, positioned from the canonical design.
import * as THREE from 'three';
import { doorShelfSetbacks } from '../doorShelfSetback.js';
import { VISUAL, toM } from '../units.js';
import { box } from './frame.js';

export function buildPartitions(design, frame, material) {
  const { panel, innerHeight, innerDepth, innerCenterZ, ranges } = frame;
  return design.partitions.map((partition, i) => box({
    size: [partition.thickness, innerHeight, innerDepth],
    center: [ranges[i][1] + partition.thickness / 2, panel + innerHeight / 2, innerCenterZ],
    material,
    userData: { componentId: partition.id, kind: 'partition' },
  }));
}

export function buildCompartmentItems(design, frame, materials) {
  const carcassAppearance = design.carcass.appearance;
  const setbacks = doorShelfSetbacks(design);
  return design.compartments.flatMap((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const cx = (x0 + x1) / 2;
    const width = x1 - x0;
    const floor = frame.panel;
    // Items span from the back panel to the setback: z in [-innerDepth, -setback].
    const itemDepth = frame.innerDepth - setbacks[ci];
    const itemCenterZ = -(frame.innerDepth + setbacks[ci]) / 2;
    const shelves = compartment.shelves.map((shelf) => box({
      size: [width, shelf.thickness, itemDepth],
      center: [cx, floor + shelf.y + shelf.thickness / 2, itemCenterZ],
      material: materials.forAppearance(shelf.appearance ?? carcassAppearance),
      userData: { componentId: shelf.id, kind: 'shelf', compartmentId: compartment.id },
    }));
    const drawers = compartment.drawers.flatMap((drawer) => {
      const centerY = floor + drawer.y + drawer.height / 2;
      const front = -setbacks[ci];
      const body = box({
        size: [width - 2 * VISUAL.drawerGap, drawer.height - 2 * VISUAL.drawerGap, itemDepth],
        center: [cx, centerY, itemCenterZ],
        material: materials.forAppearance(drawer.appearance ?? carcassAppearance),
        userData: { componentId: drawer.id, kind: 'drawer', compartmentId: compartment.id },
        rounded: true,
      });
      // Visual-only pull, centred on the drawer front. Clicks pass through to the drawer.
      const pull = box({
        size: [Math.min(VISUAL.pullWidth, width * 0.5), VISUAL.pullHeight, VISUAL.pullDepth],
        center: [cx, centerY, front + VISUAL.pullDepth / 2],
        material: materials.hardware,
        userData: { kind: 'pull' },
        rounded: true,
      });
      pull.raycast = () => {};
      return [body, pull];
    });
    const rails = compartment.rails.map((rail) => {
      const geometry = new THREE.CylinderGeometry(toM(VISUAL.railRadius), toM(VISUAL.railRadius), toM(width), 16);
      geometry.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, materials.rail);
      mesh.position.set(toM(cx), toM(floor + rail.y), toM(frame.innerCenterZ));
      mesh.castShadow = true;
      mesh.userData = { componentId: rail.id, kind: 'rail', compartmentId: compartment.id };
      return mesh;
    });
    return [...shelves, ...drawers, ...rails];
  });
}
