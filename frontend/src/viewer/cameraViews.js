// Standard camera views and the smooth transition between poses. Pure functions: no WebGL, no store.
// The camera is view state only; it is never part of the design (the canonical state).
import { toM } from './units.js';

export const VIEWS = Object.freeze(['front', 'side', 'threeQuarter', 'reset']);

// Must match the viewer's PerspectiveCamera and OrbitControls limits (viewer.js).
export const CAMERA = Object.freeze({
  fov: 40, minDistance: 0.6, maxDistance: 14, margin: 1.35, maxPolarAngle: Math.PI / 2 - 0.02,
});
export const TRANSITION_MS = 600;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// The controls will not go below this polar angle, so "level" views sit as low as it allows
// (about 1 degree above the centre height), at exactly `radius` from the target.
const levelPoint = (radius) => ({ across: radius * Math.sin(CAMERA.maxPolarAngle), rise: radius * Math.cos(CAMERA.maxPolarAngle) });
const halfFov = Math.tan((CAMERA.fov / 2) * (Math.PI / 180));
// Distance at which a box of `widthM` x `heightM` fits the view (the narrower axis decides), with a margin.
const fitDistance = (widthM, heightM, aspect) => (
  Math.max(heightM / (2 * halfFov), widthM / (2 * halfFov * aspect)) * CAMERA.margin
);
const clampDistance = (distance) => clamp(distance, CAMERA.minDistance, CAMERA.maxDistance);

/** The wardrobe centre in scene metres (x from the left face, y from the floor, z behind the front face). */
export function centreOf({ width, height, depth }) {
  return [toM(width / 2), toM(height / 2), toM(-depth / 2)];
}

/**
 * The camera pose (position and look-at target, in metres) for a named view of a wardrobe.
 * `reset` is the default pose used when the overall size changes.
 */
export function viewPose(name, dimensions, { aspect = 1 } = {}) {
  const { width, height, depth } = dimensions;
  const target = centreOf(dimensions);
  const [cx, cy, cz] = target;
  // The default pose keeps the original fit rule (square view) so Reset matches the app's initial framing.
  const initial = clampDistance(fitDistance(toM(Math.max(width, height)), toM(Math.max(width, height)), 1));
  switch (name) {
    case 'reset':
      return { position: [cx + initial * 0.35, cy + initial * 0.12, initial], target };
    case 'front': {
      // Frame the front face (width x height); the camera sits depth/2 further back from the centre.
      const radius = clampDistance(fitDistance(toM(width), toM(height), aspect) + toM(depth) / 2);
      const { across, rise } = levelPoint(radius);
      return { position: [cx, cy + rise, cz + across], target };
    }
    case 'side': {
      const radius = clampDistance(fitDistance(toM(depth), toM(height), aspect) + toM(width) / 2);
      const { across, rise } = levelPoint(radius);
      return { position: [cx + across, cy + rise, cz], target };
    }
    case 'threeQuarter': {
      // 45 degrees to the front-right, a little above; the direction is normalised so the distance is exact.
      const spread = toM(width + depth) * Math.SQRT1_2;
      const radius = clampDistance(fitDistance(spread, toM(height), aspect) + toM(Math.hypot(width, depth)) / 4);
      const norm = Math.hypot(Math.SQRT1_2, 0.22, Math.SQRT1_2);
      const scale = radius / norm;
      return { position: [cx + Math.SQRT1_2 * scale, cy + 0.22 * scale, cz + Math.SQRT1_2 * scale], target };
    }
    default:
      throw new RangeError(`unknown camera view: ${name}`);
  }
}

export const easeInOutCubic = (t) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};

const lerp = (a, b, t) => a + (b - a) * t;

function toSpherical(pose) {
  const [dx, dy, dz] = pose.position.map((v, i) => v - pose.target[i]);
  const radius = Math.hypot(dx, dy, dz);
  return { radius, azimuth: Math.atan2(dx, dz), polar: radius === 0 ? 0 : Math.acos(clamp(dy / radius, -1, 1)) };
}

/** Blend two poses at progress `t` (0..1). The camera swings around the target by the shortest arc. */
export function interpolatePose(from, to, t) {
  const target = from.target.map((v, i) => lerp(v, to.target[i], t));
  const a = toSpherical(from);
  const b = toSpherical(to);
  let delta = b.azimuth - a.azimuth;
  delta -= Math.round(delta / (2 * Math.PI)) * 2 * Math.PI; // shortest way round
  const radius = lerp(a.radius, b.radius, t);
  const azimuth = a.azimuth + delta * t;
  const polar = lerp(a.polar, b.polar, t);
  const position = [
    target[0] + radius * Math.sin(polar) * Math.sin(azimuth),
    target[1] + radius * Math.cos(polar),
    target[2] + radius * Math.sin(polar) * Math.cos(azimuth),
  ];
  return { position, target };
}

/**
 * A running camera transition. `sample(now)` returns the pose to apply and whether it has finished.
 * `duration` 0 (reduced motion) finishes immediately.
 */
export function createTransition({ from, to, startedAt, duration = TRANSITION_MS }) {
  return {
    to,
    sample(now) {
      if (duration <= 0) return { pose: to, done: true };
      const progress = clamp((now - startedAt) / duration, 0, 1);
      return progress >= 1 ? { pose: to, done: true } : { pose: interpolatePose(from, to, easeInOutCubic(progress)), done: false };
    },
  };
}
