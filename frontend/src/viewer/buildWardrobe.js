// Pure scene construction: canonical design -> THREE.Group. No DOM, no WebGL, so it
// is unit-testable in Node. Every mesh carries userData { componentId, kind }.
import * as THREE from 'three';
import { buildCarcass } from './builders/carcass.js';
import { buildDoors } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { buildCompartmentItems, buildPartitions } from './builders/interior.js';

/**
 * `printFor(doorId, widthMm, heightMm, baseMaterial)` (optional, view only) returns a front-face
 * material for a door with a printed image, or null. The PDF snapshot never passes it.
 */
export function buildWardrobe(design, materials, { doorsVisible, printFor = null }) {
  const frame = frameOf(design);
  const carcassMaterial = materials.forAppearance(design.carcass.appearance);
  const group = new THREE.Group();
  group.name = 'wardrobe';
  group.add(
    ...buildCarcass(frame, carcassMaterial),
    ...buildPartitions(design, frame, carcassMaterial),
    ...buildCompartmentItems(design, frame, materials),
    ...(doorsVisible ? buildDoors(design, frame, materials, printFor) : []),
  );
  return group;
}

/** Free GPU geometry of a previously built group (materials are cached separately, except
 * per-door print materials, which belong to this group and are freed with it). */
export function disposeWardrobe(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    [object.material].flat().filter((m) => m?.userData.print).forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
  });
}

/** Every material a group uses (a printed door has one material per box face). */
export const materialsOf = (group) => new Set(group.children.flatMap((mesh) => [mesh.material].flat()));
