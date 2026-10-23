// "Doors open" view: moves door objects (panel, outline, handle) without nesting them, so picking,
// meshOf and the highlighter keep working on the flat list of wardrobe children. View state only:
// nothing here reads or writes the design.
//   hinge: rotate around the vertical hinge axis at `pivot` [x, z] (mm), outward for `sign`.
//   slide: shift along the track by [dx, dz] (mm).
import * as THREE from 'three';
import { toM, VISUAL } from './units.js';

/** Place `object` at `amount` (0 = closed, 1 = open) of its opening motion. */
export function applyOpening(object, amount) {
  const opening = object.userData.opening;
  if (!opening) return;
  object.userData.closedPosition ??= object.position.clone();
  const base = object.userData.closedPosition;
  if (opening.type === 'hinge') {
    const angle = opening.sign * amount * THREE.MathUtils.degToRad(VISUAL.doorOpenAngle);
    const [px, pz] = opening.pivot.map(toM);
    const dx = base.x - px;
    const dz = base.z - pz;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos.
    object.position.set(px + dx * cos + dz * sin, base.y, pz - dx * sin + dz * cos);
    object.rotation.set(0, angle, 0);
  } else {
    object.position.set(base.x + amount * toM(opening.dx), base.y, base.z + amount * toM(opening.dz));
  }
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Animates the doors of the current wardrobe group toward open or closed.
 * `step(ms)` advances by the elapsed time and returns true while moving.
 */
export function createDoorMotion({ duration = VISUAL.doorOpenMs, reducedMotion = () => false } = {}) {
  let progress = 0; // linear 0..1
  let target = 0;
  let group = null;
  const apply = () => group?.children.forEach((object) => applyOpening(object, easeInOut(progress)));

  return {
    /** A freshly built group takes the current position at once (no flash of closed doors). */
    attach(next) {
      group = next;
      apply();
    },
    setOpen(open) {
      target = open ? 1 : 0;
      if (reducedMotion()) {
        progress = target;
        apply();
      }
    },
    step(ms) {
      if (progress === target) return false;
      const delta = ms / duration;
      progress = target > progress ? Math.min(target, progress + delta) : Math.max(target, progress - delta);
      apply();
      return true;
    },
    amount: () => easeInOut(progress),
    isSettled: () => progress === target,
  };
}
