// "360° view": the camera circles the wardrobe once, like a short product video, then returns to where
// it started. Camera only: the design and the store are never touched.
import * as THREE from 'three';

// ASSUMPTION: a configurable default, long enough to look at every side, short enough to watch whole.
export const SPIN_DURATION_MS = 12_000;
const UP = new THREE.Vector3(0, 1, 0);

/** Angle (radians, 0 → 2π) after `elapsed` ms, eased in and out so the start and stop are smooth. */
export function turntableAngle(elapsed, duration = SPIN_DURATION_MS) {
  const t = Math.min(Math.max(elapsed / duration, 0), 1);
  const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return eased * 2 * Math.PI;
}

/**
 * One turn around `target` (a live Vector3, e.g. controls.target) on the vertical axis.
 * `tick()` runs every frame and moves the camera while spinning; time comes from `now()`, so the
 * speed does not depend on the frame rate. `onChange(spinning)` reports every start and end.
 */
export function createTurntable({ camera, target, duration = SPIN_DURATION_MS, now = () => performance.now(), onChange = () => {} }) {
  let spin = null;

  const end = ({ restore }) => {
    if (!spin) return;
    if (restore) camera.position.copy(spin.origin);
    camera.lookAt(target);
    spin = null;
    onChange(false);
  };

  return {
    isSpinning: () => spin !== null,
    start() {
      if (spin) return;
      spin = { origin: camera.position.clone(), offset: camera.position.clone().sub(target), startedAt: now() };
      onChange(true);
    },
    /** Stop early. `restore`: go back to the starting view (Stop button) or stay (the user took over). */
    stop({ restore = true } = {}) {
      end({ restore });
    },
    /** Returns true while the turntable owns the camera this frame. */
    tick() {
      if (!spin) return false;
      const elapsed = now() - spin.startedAt;
      if (elapsed >= duration) {
        end({ restore: true }); // a full turn ends exactly where it started
        return false;
      }
      camera.position.copy(spin.offset).applyAxisAngle(UP, turntableAngle(elapsed, duration)).add(target);
      camera.lookAt(target);
      return true;
    },
  };
}
