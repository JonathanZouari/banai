// Preset camera angles ("front", right and left "side", "3/4", "reset") and the smooth flight between them.
// Pure pose math on plain [x, y, z] arrays in metres: no Three.js objects and no design state,
// so a camera move can never change the design.
import { toM } from './units.js';

export const VIEWS = Object.freeze(['front', 'side', 'sideLeft', 'threeQuarter', 'reset']);
export const TRANSITION_MS = 600;

// ASSUMPTION: visual-only framing values, tuned so the whole wardrobe fits with some margin.
const FIT_MARGIN = 1.35;
const deg = (degrees) => (degrees * Math.PI) / 180;
// Azimuth 0 looks at the front (+Z); positive turns towards the right side (+X). Elevation stays
// above the horizon so OrbitControls' maxPolarAngle never clamps the pose mid-flight.
const ANGLES = Object.freeze({
  front: { azimuth: 0, elevation: deg(5) },
  side: { azimuth: deg(90), elevation: deg(5) },
  sideLeft: { azimuth: deg(-90), elevation: deg(5) },
  threeQuarter: { azimuth: deg(45), elevation: deg(20) },
});

const centerOf = ({ width, height, depth }) => [toM(width / 2), toM(height / 2), toM(-depth / 2)];
const fitDistance = (extentMm, fovDeg) => (toM(extentMm) / (2 * Math.tan(deg(fovDeg) / 2))) * FIT_MARGIN;

/** The extent (mm) the camera must fit for each view: what is actually seen from that side. */
function extentFor(view, { width, height, depth }) {
  if (view === 'side' || view === 'sideLeft') return Math.max(depth, height);
  if (view === 'threeQuarter') return Math.max(Math.hypot(width, depth), height);
  return Math.max(width, height);
}

/** How much nearer (mm) the wardrobe's closest face is than its centre, seen from each view. */
function nearOffsetFor(view, { width, depth }) {
  if (view === 'side' || view === 'sideLeft') return width / 2;
  if (view === 'threeQuarter') return (width / 2 + depth / 2) * Math.SQRT1_2;
  return depth / 2;
}

/** Camera pose `{ position, target }` for a preset view of a wardrobe with these dimensions (mm). */
export function cameraPose(view, dimensions, fovDeg) {
  if (!VIEWS.includes(view)) throw new Error(`Unknown camera view: ${view}`);
  const target = centerOf(dimensions);
  if (view === 'reset') {
    // The opening view, exactly as the viewer has always framed a new design.
    const distance = fitDistance(Math.max(dimensions.width, dimensions.height), fovDeg);
    return { position: [target[0] + distance * 0.35, target[1] + distance * 0.12, distance], target };
  }
  const { azimuth, elevation } = ANGLES[view];
  const distance = fitDistance(extentFor(view, dimensions), fovDeg) + toM(nearOffsetFor(view, dimensions));
  const offset = [
    distance * Math.cos(elevation) * Math.sin(azimuth),
    distance * Math.sin(elevation),
    distance * Math.cos(elevation) * Math.cos(azimuth),
  ];
  return { position: target.map((value, i) => value + offset[i]), target };
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => a.map((value, i) => lerp(value, b[i], t));

function toOrbit([x, y, z]) {
  const radius = Math.hypot(x, y, z);
  return { radius, azimuth: Math.atan2(x, z), polar: radius === 0 ? 0 : Math.acos(Math.min(1, Math.max(-1, y / radius))) };
}

/**
 * The pose a fraction `t` (0..1) of the way from `from` to `to`. The camera orbits around the
 * moving target (radius and angles interpolated, azimuth the short way round) instead of cutting
 * a straight line through the wardrobe. A half turn (right side to left side) swings past the
 * front, never behind the wardrobe.
 */
export function interpolatePose(from, to, t) {
  const target = lerp3(from.target, to.target, t);
  const a = toOrbit(from.position.map((value, i) => value - from.target[i]));
  const b = toOrbit(to.position.map((value, i) => value - to.target[i]));
  let turn = b.azimuth - a.azimuth;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  if (Math.abs(Math.abs(turn) - Math.PI) < 1e-6) turn = a.azimuth > 0 ? -Math.PI : Math.PI;
  const radius = lerp(a.radius, b.radius, t);
  const azimuth = a.azimuth + turn * t;
  const polar = lerp(a.polar, b.polar, t);
  const offset = [
    radius * Math.sin(polar) * Math.sin(azimuth),
    radius * Math.cos(polar),
    radius * Math.sin(polar) * Math.cos(azimuth),
  ];
  return { position: target.map((value, i) => value + offset[i]), target };
}
