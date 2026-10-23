// Camera presets (front, side, 3/4, reset) and a smooth move between camera poses. Camera only:
// nothing here touches the store, so choosing a view never changes the design state.
import * as THREE from 'three';
import { toM } from './units.js';

export const VIEWS = Object.freeze(['front', 'side', 'threeQuarter', 'reset']);
export const TRANSITION_MS = 600;

// ASSUMPTION: visual framing defaults. Offsets from the wardrobe centre, in units of the fit
// distance. `reset` is the framing the viewer has always opened with; its depth is measured from
// the front face (z = 0), as it always was.
const OFFSETS = Object.freeze({
  front: [0, 0.12, 1.06],
  side: [1.06, 0.12, 0],
  threeQuarter: [0.75, 0.3, 0.75],
  reset: [0.35, 0.12, 1],
});

/** Where the camera sits and looks for `view`, framing the whole wardrobe. */
export function cameraPose(design, view, fov) {
  const offset = OFFSETS[view];
  if (!offset) throw new Error(`unknown camera view: ${view}`);
  const { width, height, depth } = design.dimensions;
  const target = new THREE.Vector3(toM(width / 2), toM(height / 2), toM(-depth / 2));
  const distance = (toM(Math.max(width, height)) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)))) * 1.35;
  const anchor = view === 'reset' ? new THREE.Vector3(target.x, target.y, 0) : target;
  const position = anchor.clone().add(new THREE.Vector3(...offset).multiplyScalar(distance));
  return { position, target };
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

export const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Moves the camera (and the orbit target) to a pose. `update()` runs once per frame; with reduced
 * motion, or when `animate` is false, the camera jumps straight to the pose.
 */
export function createCameraMover(camera, controls, { now = () => performance.now(), reducedMotion = prefersReducedMotion } = {}) {
  let move = null;

  const place = (position, target) => {
    camera.position.copy(position);
    controls.target.copy(target);
  };

  return {
    moveTo(pose, { animate = true } = {}) {
      if (!animate || reducedMotion()) {
        move = null;
        place(pose.position, pose.target);
        return;
      }
      move = {
        start: now(),
        fromPosition: camera.position.clone(),
        fromTarget: controls.target.clone(),
        to: { position: pose.position.clone(), target: pose.target.clone() },
      };
    },
    /** Advance an active move; returns true while it is still running. */
    update() {
      if (!move) return false;
      const t = Math.min((now() - move.start) / TRANSITION_MS, 1);
      const k = easeInOutCubic(t);
      place(move.fromPosition.clone().lerp(move.to.position, k), move.fromTarget.clone().lerp(move.to.target, k));
      if (t === 1) move = null;
      return move !== null;
    },
    cancel() {
      move = null;
    },
    isMoving: () => move !== null,
  };
}
