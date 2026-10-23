// Pure door animation maths. Poses are in scene units (metres).
const MAX_SWING = (100 * Math.PI) / 180;
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * Pose of a door for openness 0 (closed) .. 1 (open). Left hinges swing by -angle about y and
 * right hinges by +angle, so the free edge always moves toward +z (the viewer), never into the carcass.
 * Sliding: odd (front) panels slide over the even ones by up to one panel width.
 */
export function doorPose(userData, openness) {
  const o = clamp01(openness);
  const closed = userData.closed;
  if (!closed) return null;
  const [cx, cy, cz] = closed.position;
  if (userData.hinge) {
    const angle = (userData.hingeSide === 'right' ? 1 : -1) * MAX_SWING * o;
    const dx = cx - userData.hinge.x;
    const dz = cz - userData.hinge.z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      position: [userData.hinge.x + dx * cos + dz * sin, cy, userData.hinge.z - dx * sin + dz * cos],
      rotationY: closed.rotationY + angle,
    };
  }
  if (userData.slide) {
    const { index, width } = userData.slide;
    return { position: [cx + (index % 2 === 1 ? -width * o : 0), cy, cz], rotationY: closed.rotationY };
  }
  return { position: [cx, cy, cz], rotationY: closed.rotationY };
}

/** Pose every door mesh in the group; returns whether anything changed. */
export function applyDoorMotion(group, openness) {
  let changed = false;
  group.children.forEach((mesh) => {
    if (mesh.userData.kind !== 'door') return;
    const pose = doorPose(mesh.userData, openness);
    if (!pose) return;
    const [x, y, z] = pose.position;
    if (mesh.position.x !== x || mesh.position.y !== y || mesh.position.z !== z || mesh.rotation.y !== pose.rotationY) {
      mesh.position.set(x, y, z);
      mesh.rotation.y = pose.rotationY;
      changed = true;
    }
  });
  return changed;
}
