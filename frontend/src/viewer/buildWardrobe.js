// Pure scene construction: canonical design -> THREE.Group. No DOM, no WebGL, so it
// is unit-testable in Node. Every mesh carries userData { componentId, kind }.
import * as THREE from 'three';
import { buildCarcass } from './builders/carcass.js';
import { buildDoors } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { addFrontHardware } from './builders/handles.js';
import { buildCompartmentItems, buildPartitions } from './builders/interior.js';

export function buildWardrobe(design, materials, { doorsVisible = true, hardware = null } = {}) {
  const frame = frameOf(design);
  const carcassMaterial = materials.forAppearance(design.carcass.appearance);
  const group = new THREE.Group();
  group.name = 'wardrobe';
  group.add(
    ...buildCarcass(frame, carcassMaterial),
    ...buildPartitions(design, frame, carcassMaterial),
    ...buildCompartmentItems(design, frame, materials),
    ...(doorsVisible ? buildDoors(design, frame, materials) : []),
  );
  if (hardware) addFrontHardware(group, design, hardware, { doorsVisible });
  return group;
}

/** Free GPU geometry of a previously built group (materials, incl. shared hardware, are owned elsewhere). */
export function disposeWardrobe(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
  });
}
