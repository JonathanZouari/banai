// Partitions, shelves, drawers and rails, positioned from the canonical design.
import * as THREE from 'three';
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

const noRaycast = () => {};

/** A thin rod between two points (mm), as visual hardware that clicks pass through. */
function rod(from, to, radius, material, part) {
  const start = new THREE.Vector3(...from.map(toM));
  const end = new THREE.Vector3(...to.map(toM));
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(toM(radius), toM(radius), direction.length(), 10);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.userData = { kind: 'hardware', part };
  mesh.raycast = noRaycast;
  return mesh;
}

/**
 * The lift mechanism of a pull-down rail (visual only): on each side wall a mounting plate high
 * at the back, an arm down and forward to the rail, and a pull rod hanging from the rail's middle.
 */
function liftMechanism({ x0, x1, railY, top, backZ, railZ }, materials) {
  const pivotY = Math.min(railY + VISUAL.liftArmRise, top - VISUAL.liftPlateHeight / 2);
  const pivotZ = backZ + VISUAL.liftPivotFromBack;
  const parts = [];
  for (const x of [x0 + VISUAL.liftInset, x1 - VISUAL.liftInset]) {
    const plate = box({
      size: [VISUAL.liftPlateThickness, VISUAL.liftPlateHeight, VISUAL.liftPlateDepth],
      center: [x, pivotY, pivotZ],
      material: materials.hardware,
      userData: { kind: 'hardware', part: 'lift-plate' },
    });
    plate.raycast = noRaycast;
    parts.push(plate, rod([x, pivotY, pivotZ], [x, railY, railZ], VISUAL.liftArmRadius, materials.hardware, 'lift-arm'));
  }
  const middle = (x0 + x1) / 2;
  parts.push(rod([middle, railY, railZ], [middle, railY - VISUAL.liftPullLength, railZ + 20], VISUAL.liftArmRadius, materials.hardware, 'lift-pull'));
  return parts;
}

export function buildCompartmentItems(design, frame, materials) {
  const carcassAppearance = design.carcass.appearance;
  return design.compartments.flatMap((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const cx = (x0 + x1) / 2;
    const width = x1 - x0;
    const floor = frame.panel;
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
    const rails = compartment.rails.flatMap((rail) => {
      const pulldown = rail.type === 'pulldown';
      // A lift rail is shorter (it hangs between the two arms) and sits towards the front.
      const length = pulldown ? width - 2 * VISUAL.liftInset : width;
      const railZ = pulldown ? frame.innerCenterZ + frame.innerDepth * 0.15 : frame.innerCenterZ;
      const geometry = new THREE.CylinderGeometry(toM(VISUAL.railRadius), toM(VISUAL.railRadius), toM(length), 16);
      geometry.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, materials.rail);
      mesh.position.set(toM(cx), toM(floor + rail.y), toM(railZ));
      mesh.userData = { componentId: rail.id, kind: 'rail', compartmentId: compartment.id, railType: rail.type };
      if (!pulldown) return [mesh];
      const backZ = frame.innerCenterZ - frame.innerDepth / 2;
      return [mesh, ...liftMechanism({
        x0, x1, railY: floor + rail.y, top: floor + frame.innerHeight, backZ, railZ,
      }, materials)];
    });
    return [...shelves, ...drawers, ...rails];
  });
}
