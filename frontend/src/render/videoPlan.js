// Pure timeline of the demo video: every frame's time, the open sequence (closed, opening, held
// open, closing) and the camera's slow orbit. No DOM, no WebGL: unit-tested in Node, and the same
// plan drives the raster recording and, later, a path-traced one.
import { centerOf, fitDistance } from '../viewer/camera.js';

export const VIDEO = Object.freeze({ seconds: 8, fps: 30, width: 1280, height: 720 });
// Path-traced: every frame is its own render. Measured on the dev GPU with a readPixels sync (JS timing
// alone misses the GPU queue): 38 ms a sample at 960x540, 64 ms at 1280x720; a re-bake after the parts
// move adds about 10 ms. 32 samples at 960x540 is about 1.2 s a frame, so 6 s at 24 fps takes about 3
// minutes. Some grain remains. A weaker GPU takes longer (the progress shows the time left).
export const TRACED_VIDEO = Object.freeze({ seconds: 6, fps: 24, width: 960, height: 540, samples: 32 });
// The camera keeps the wardrobe's bounding sphere in view: open doors and the lowered pull-down stay
// inside it, so a small margin is enough.
export const VIDEO_MARGIN = 1.1;
const ORBIT_DEG = 32; // from 32° right of the front to 32° left
const ELEVATION_DEG = [9, 15]; // a little higher in the middle of the orbit

const smooth = (x) => x * x * (3 - 2 * x);
const rad = (deg) => (deg * Math.PI) / 180;

/** Sequence time (0 closed .. 1 fully open, motion.js) at video progress u (0..1). */
export function motionAtVideo(u) {
  if (u < 0.1) return 0;
  if (u < 0.5) return smooth((u - 0.1) / 0.4);
  if (u < 0.75) return 1;
  if (u < 0.95) return 1 - smooth((u - 0.75) / 0.2);
  return 0;
}

/** Camera azimuth and elevation (radians) at progress u: one slow, eased orbit across the front. */
export function orbitAt(u) {
  const s = smooth(Math.min(1, Math.max(0, u)));
  const [low, high] = ELEVATION_DEG;
  return { azimuth: rad(ORBIT_DEG - 2 * ORBIT_DEG * s), elevation: rad(low + (high - low) * Math.sin(Math.PI * u)) };
}

/** Camera pose ({ position, target }, metres) at progress u, looking at the wardrobe's centre. */
export function poseAt(dimensions, u, { fov, aspect, margin = VIDEO_MARGIN }) {
  const { azimuth, elevation } = orbitAt(u);
  const target = centerOf(dimensions);
  const distance = fitDistance(dimensions, fov, aspect, margin);
  const direction = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
  return { position: target.map((value, i) => value + direction[i] * distance), target };
}

/** Every frame: { index, timestamp, duration (seconds), u (0..1), motion }. */
export function videoFrames({ seconds = VIDEO.seconds, fps = VIDEO.fps } = {}) {
  const count = Math.max(1, Math.round(seconds * fps));
  return Array.from({ length: count }, (_, index) => {
    const u = count > 1 ? index / (count - 1) : 0;
    return { index, timestamp: index / fps, duration: 1 / fps, u, motion: motionAtVideo(u) };
  });
}
