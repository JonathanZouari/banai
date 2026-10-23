// Pure pull-out animation maths (the doors have doorMotion.js). Poses are in scene units (metres).
// A moving part is a mesh tagged by its builder (asMover) with userData.motion, how it moves, and
// userData.rest, its closed pose:
// - { type: 'slide', travel }: drawers and the trouser rack run straight out toward the viewer (+z).
// - { type: 'arm', pivot: [y, z], length, from, to }: a pull-down arm swings about its pivot (axis x)
//   from angle `from` to `to`, measured from straight up, positive toward the front.
// - { type: 'carried', pivot, length, from, to }: a part hanging from the pull-down rail (the rail,
//   its pull rod and hook) follows the arm tips without turning, so the rail stays level.
// Decorative props carried by a pull-out (userData.carrier = its component id, userData.rest) follow
// the same offset, so the trousers ride out on their rack and the garments come down with the rail.

export const PULL_OUT_SHARE = 0.7; // drawers and the trouser rack run out this share of the interior depth

const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** Tag a built mesh as a moving part; its current pose becomes the rest (closed) pose. */
export function asMover(mesh, motion) {
  mesh.userData.motion = motion;
  mesh.userData.rest = { position: mesh.position.toArray(), rotationX: mesh.rotation.x };
  return mesh;
}

const angleAt = ({ from, to }, o) => from + (to - from) * clamp01(o);

/** Offset [dx, dy, dz] (m) of the point a pull-out carries (its body, or the pull-down rail) at openness o. */
export function carriedOffset(motion, openness) {
  if (!motion) return [0, 0, 0];
  if (motion.type === 'slide') return [0, 0, motion.travel * clamp01(openness)];
  const theta = angleAt(motion, openness);
  return [0, motion.length * (Math.cos(theta) - Math.cos(motion.from)), motion.length * (Math.sin(theta) - Math.sin(motion.from))];
}

/** Pose { position, rotationX } of a moving part at openness 0 (closed) .. 1 (fully out), or null. */
export function moverPose(userData, openness) {
  const { motion, rest } = userData;
  if (!motion || !rest) return null;
  const [x, y, z] = rest.position;
  if (motion.type === 'arm') {
    const theta = angleAt(motion, openness);
    const [py, pz] = motion.pivot;
    return { position: [x, py + (motion.length / 2) * Math.cos(theta), pz + (motion.length / 2) * Math.sin(theta)], rotationX: theta };
  }
  const [dx, dy, dz] = carriedOffset(motion, openness);
  return { position: [x + dx, y + dy, z + dz], rotationX: rest.rotationX };
}

const placed = (object, [x, y, z], rotationX) => {
  if (object.position.x === x && object.position.y === y && object.position.z === z && object.rotation.x === rotationX) return false;
  object.position.set(x, y, z);
  object.rotation.x = rotationX;
  return true;
};

/**
 * Pose every moving part of a built wardrobe group, `opennessOf(componentId)` giving each one's
 * openness, and the props they carry. Returns whether anything moved.
 */
export function applyPullOuts(group, opennessOf, props = null) {
  let changed = false;
  const offsets = new Map();
  group.children.forEach((mesh) => {
    const { motion, componentId } = mesh.userData;
    if (!motion) return;
    const openness = opennessOf(componentId);
    if (!offsets.has(componentId)) offsets.set(componentId, carriedOffset(motion, openness));
    const pose = moverPose(mesh.userData, openness);
    if (pose && placed(mesh, pose.position, pose.rotationX)) changed = true;
  });
  props?.children.forEach((item) => {
    const { carrier, rest } = item.userData;
    if (!carrier || !rest) return;
    const [dx, dy, dz] = offsets.get(carrier) ?? [0, 0, 0];
    if (placed(item, [rest[0] + dx, rest[1] + dy, rest[2] + dz], item.rotation.x)) changed = true;
  });
  return changed;
}
