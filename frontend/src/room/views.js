// Camera views of the room, each with a clear purpose. Pure: positions in mm, angles in degrees.
// - doorway: the first impression, standing in the doorway at eye level; the whole wardrobe in
//   frame, turned toward the window as far as the frame allows.
// - bed: what you see every day, sitting up in bed against the headboard, facing the wardrobe.
// - plan: arranging and checking space, straight down, the wardrobe's wall at the top.
// - overview: the whole room at a glance, from outside a corner (the near walls are cut away).
// Eye-level views use a natural lens (about a real-estate photo), widened only as far as needed.
import { FURNITURE } from './catalog.js';
import { WARDROBE_FRONT } from './layout.js';
import { blocksView, DOORWAY_STEPS, doorwayEye, wardrobeSamples } from './placement.js';

export const VIEW_IDS = Object.freeze(['doorway', 'bed', 'plan', 'overview']);
export const NATURAL_FOV = 42; // vertical degrees
const MAX_FOV = 58;
const WITH_WINDOW_FOV = 50; // the lens may widen this far to show the whole window too
const SIT_HEIGHT = 1200; // sitting up in bed

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const azimuth = (eye, p) => deg(Math.atan2(p.x - eye.x, eye.z - p.z)); // 0 = toward the back wall, + toward +x

/** Is the point in frame for a camera at `eye` turned by yaw then pitched (degrees)? Exact. */
function inFrame(eye, yaw, pitch, vfov, aspect, p, fill = p.fill ?? 0.92) {
  const [sy, cy, sp, cp] = [Math.sin(rad(yaw)), Math.cos(rad(yaw)), Math.sin(rad(pitch)), Math.cos(rad(pitch))];
  const d = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
  const forward = d.x * sy * cp + d.y * sp - d.z * cy * cp;
  if (forward <= 0) return false;
  const right = d.x * cy + d.z * sy;
  const up = -d.x * sy * sp + d.y * cp + d.z * cy * sp;
  const tv = Math.tan(rad(vfov / 2)) * fill;
  return Math.abs(up) <= forward * tv && Math.abs(right) <= forward * tv * aspect;
}

/** The pitch that centres the points vertically for this yaw (exact for yaw-then-pitch). */
function centredPitch(eye, yaw, points) {
  const el = points.map((p) => {
    const depth = (p.x - eye.x) * Math.sin(rad(yaw)) + (eye.z - p.z) * Math.cos(rad(yaw));
    return deg(Math.atan2(p.y - eye.y, depth));
  });
  return (Math.min(...el) + Math.max(...el)) / 2;
}

/**
 * Aim from `eye` so the whole wardrobe is in frame and, if the lens may widen a little for it,
 * the `extra` points too (the window's corners). The lens starts natural and widens one degree
 * at a time; the turn is searched outward from the ideal one. Every point is checked exactly.
 */
function eyeLevel(eye, design, aspect, extra = [], { strict = false, needExtra = false } = {}) {
  const { width, height } = design.dimensions;
  const wardrobe = [0, width].flatMap((x) => [0, height].map((y) => ({ x, y, z: WARDROBE_FRONT })));
  const ideal = (points) => {
    const az = points.map((p) => azimuth(eye, p));
    return (Math.min(...az) + Math.max(...az)) / 2;
  };
  const search = (points, maxFov) => {
    const centre = ideal(points);
    for (let vfov = NATURAL_FOV; vfov <= maxFov; vfov += 1) {
      for (let step = 0; step <= 120; step += 1) {
        const yaw = centre + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 0.5;
        const pitch = centredPitch(eye, yaw, points);
        if (points.every((p) => inFrame(eye, yaw, pitch, vfov, aspect, p))) return { yaw, pitch, fov: vfov };
      }
    }
    return null;
  };
  const withExtra = extra.length ? search([...wardrobe, ...extra], WITH_WINDOW_FOV) : null;
  if (needExtra && !withExtra) return null;
  const found = withExtra || search(wardrobe, MAX_FOV);
  if (!found && strict) return null;
  const pose = found ?? { yaw: ideal(wardrobe), pitch: centredPitch(eye, ideal(wardrobe), wardrobe), fov: MAX_FOV };
  const reach = 1000;
  return {
    position: { ...eye },
    target: {
      x: eye.x + Math.sin(rad(pose.yaw)) * Math.cos(rad(pose.pitch)) * reach,
      y: eye.y + Math.sin(rad(pose.pitch)) * reach,
      z: eye.z - Math.cos(rad(pose.yaw)) * Math.cos(rad(pose.pitch)) * reach,
    },
    fov: pose.fov,
  };
}

/**
 * Seats on the bed, from up against the headboard toward the foot, facing the wardrobe across the
 * room: [{ x, y, z }]. The bed view takes the first one from which nothing hides the wardrobe and
 * the whole wardrobe fits in frame.
 */
export function bedSeats(placed) {
  const bed = placed.find((p) => p.id === 'bed');
  if (!bed) return [];
  const { depth } = FURNITURE[bed.kind];
  const facing = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }[bed.rotation];
  const seats = [];
  for (let along = -(depth / 2 - 550); along <= depth / 2 - 450; along += 150) {
    seats.push({ x: bed.x + facing[0] * along, y: SIT_HEIGHT, z: bed.z + facing[1] * along });
  }
  return seats;
}

/** The seat the bed view uses (see bedSeats), or null without a bed. */
export function bedEye(placed, design, aspect = 1.6) {
  const seats = bedSeats(placed);
  const others = placed.filter((p) => p.id !== 'bed' && !FURNITURE[p.kind].underlay);
  const samples = wardrobeSamples(design);
  const clear = (eye) => !others.some((p) => blocksView(p.rect, FURNITURE[p.kind].height, eye, samples));
  return seats.find((eye) => clear(eye) && eyeLevel(eye, design, aspect, [], { strict: true })) ?? seats.find(clear) ?? seats[0] ?? null;
}

/**
 * The camera pose for a view: { position, target, fov } (mm, degrees). `placed` is the furniture
 * (placeFurniture), `aspect` the view's width / height.
 */
export function roomView(view, { design, box, placed, aspect }) {
  const centre = { x: (box.x0 + box.x1) / 2, z: (box.zBack + box.zFront) / 2 };
  if (view === 'bed') {
    const eye = bedEye(placed, design, aspect) ?? { x: centre.x, y: SIT_HEIGHT, z: box.zFront - 900 };
    return eyeLevel(eye, design, aspect);
  }
  if (view === 'plan') {
    const fov = 36;
    const t = Math.tan(rad(fov / 2));
    const lift = Math.max((box.zFront - box.zBack) / 2 / t, (box.x1 - box.x0) / 2 / (t * aspect)) * 1.12 + box.height;
    // A hair toward the front, so "up" on screen is the wardrobe's wall.
    return { position: { x: centre.x, y: lift, z: centre.z + 1 }, target: { x: centre.x, y: 0, z: centre.z }, fov };
  }
  if (view === 'overview') {
    const span = Math.max(box.x1 - box.x0, box.zFront - box.zBack);
    return {
      position: { x: box.x1 + span * 0.55, y: box.height * 1.75, z: box.zFront + span * 0.62 },
      target: { x: centre.x, y: box.height * 0.3, z: centre.z },
      fov: 40,
    };
  }
  // doorway (default): the wardrobe and the whole window. Standing a step further back, up to the
  // threshold itself, if that is what it takes for both to fit; otherwise the wardrobe alone.
  const win = box.window;
  // The wardrobe keeps breathing room in the frame; the window may come close to the edge.
  const windowPoints = [win.z0, win.z1].flatMap((z) => [win.y0, win.y1].map((y) => ({ x: box.x1, y, z, fill: 0.98 })));
  const samples = wardrobeSamples(design);
  const solid = placed.filter((p) => !FURNITURE[p.kind].underlay);
  const inside = doorwayEye(box);
  for (const back of DOORWAY_STEPS) {
    const eye = doorwayEye(box, back);
    if (solid.some((p) => blocksView(p.rect, FURNITURE[p.kind].height, eye, samples))) continue;
    const pose = eyeLevel(eye, design, aspect, windowPoints, { strict: true, needExtra: true });
    if (pose) return pose;
  }
  return eyeLevel(inside, design, aspect, windowPoints);
}
