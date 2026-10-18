// Pure scene construction: canonical design -> THREE.Group. No DOM, no WebGL, so it
// is unit-testable in Node. Every mesh carries userData { componentId, kind }.
import * as THREE from 'three';
import { buildCarcass } from './builders/carcass.js';
import { buildDoors, poseDoors } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { buildCompartmentItems, buildPartitions } from './builders/interior.js';

/** `doorsOpen` (0..1) is the initial door pose: 0 closed, 1 open (interior view). */
export function buildWardrobe(design, materials, { doorsOpen = 0 } = {}) {
  const frame = frameOf(design);
  const carcassMaterial = materials.forAppearance(design.carcass.appearance);
  const group = new THREE.Group();
  group.name = 'wardrobe';
  group.add(
    ...buildCarcass(frame, carcassMaterial),
    ...buildPartitions(design, frame, carcassMaterial),
    ...buildCompartmentItems(design, frame, materials),
    ...buildDoors(design, frame, materials),
  );
  return poseDoors(group, doorsOpen);
}

/** Free GPU geometry of a previously built group (shared materials are cached separately). */
export function disposeWardrobe(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.userData.ownsMaterial) object.material.dispose();
  });
}
