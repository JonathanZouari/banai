// Camera framing: pure maths (no Three.js), so it can be unit-tested in Node.
// Positions are in metres, Y up; the wardrobe spans x 0..W, y 0..H, z -D..0 (front at z = 0).
import { toM } from './units.js';

/** View presets: unit direction from the wardrobe centre towards the camera. */
export const VIEWS = Object.freeze({
  front: Object.freeze([0, 0.04, 1]),
  angle: Object.freeze([0.42, 0.16, 1]),
  side: Object.freeze([1, 0.08, 0.18]),
  top: Object.freeze([0, 1.6, 1]),
});

// Extra room around the wardrobe for the dimension lines and their labels.
const MARGIN = 1.22;

/**
 * Where to put the camera so the whole wardrobe (plus dimension labels) is in frame.
 * Fits the bounding sphere against BOTH the vertical and the horizontal field of view,
 * so a narrow viewport never crops the sides.
 */
export function frameView(dimensions, { fovDeg, aspect, view = 'angle' }) {
  const direction = VIEWS[view] ?? VIEWS.angle;
  const w = toM(dimensions.width);
  const h = toM(dimensions.height);
  const d = toM(dimensions.depth);
  const target = [w / 2, h / 2, -d / 2];
  const radius = (Math.hypot(w, h, d) / 2) * MARGIN;
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 0.1));
  const distance = radius / Math.sin(Math.min(vHalf, hHalf));
  const length = Math.hypot(...direction);
  const position = direction.map((component, i) => target[i] + (component / length) * distance);
  return { target, position, distance };
}

/** Ease-in-out cubic, t in [0, 1]. */
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
