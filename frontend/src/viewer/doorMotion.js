// Door open/close animation. Purely visual: whether a door is open is NOT part of the
// canonical design (it is not an edit, is not saved and is not in undo history).
// Hinged doors swing outwards around their hinge edge; sliding doors glide along their
// track over the neighbouring panel. A door's handle and outline (userData.doorId) move
// rigidly with it. Poses are recomputed from each mesh's built ("closed") position, so
// rebuilding the scene never accumulates drift.
import * as THREE from 'three';

// ASSUMPTION: visual-only prototype values, not product specifications.
export const DOOR_OPEN_ANGLE = THREE.MathUtils.degToRad(100);
export const SLIDE_SHARE = 0.92; // a sliding panel travels 92% of its width
export const DOOR_ANIM_MS = 650;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Smooth start and stop. */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

/** Remember the closed pose of a freshly built mesh. */
function baseOf(mesh) {
  if (!mesh.userData.base) {
    const { width = 0, depth = 0 } = mesh.geometry?.parameters ?? {};
    mesh.userData.base = { position: mesh.position.clone(), width, depth };
  }
  return mesh.userData.base;
}

/**
 * Pose a door panel (and its attached parts) `amount` (0 = closed … 1 = open, already eased)
 * of the way open. Hinged: rotate about the vertical hinge line on the panel's back face,
 * swinging towards the viewer (+z). Sliding: translate along x by `slideDir`.
 */
export function applyDoorPose(panel, amount, parts = []) {
  const { position: p, width, depth } = baseOf(panel);
  const all = [panel, ...parts];
  all.forEach(baseOf);
  if (amount <= 0) { // exactly the built pose
    all.forEach((mesh) => {
      mesh.position.copy(mesh.userData.base.position);
      mesh.rotation.set(0, 0, 0);
    });
    return;
  }
  if (panel.userData.doorType === 'sliding') {
    const dx = (panel.userData.slideDir ?? 1) * width * SLIDE_SHARE * amount;
    all.forEach((mesh) => {
      const b = mesh.userData.base.position;
      mesh.position.set(b.x + dx, b.y, b.z);
      mesh.rotation.set(0, 0, 0);
    });
    return;
  }
  const side = panel.userData.hingeSide === 'right' ? 1 : -1; // pivot on the right or left edge
  const angle = side * DOOR_OPEN_ANGLE * amount; // left hinge swings by -θ, right hinge by +θ
  const pivot = new THREE.Vector3(p.x + (side * width) / 2, p.y, p.z - depth / 2);
  all.forEach((mesh) => {
    const offset = mesh.userData.base.position.clone().sub(pivot).applyAxisAngle(Y_AXIS, angle);
    mesh.position.copy(pivot).add(offset);
    mesh.rotation.set(0, angle, 0);
  });
}

export function createDoorMotion({ durationMs = DOOR_ANIM_MS } = {}) {
  const doors = new Map(); // id -> { progress: 0..1 (linear), target: 0 | 1 }
  const entry = (id) => {
    if (!doors.has(id)) doors.set(id, { progress: 0, target: 0 });
    return doors.get(id);
  };
  /** [{ panel, parts }] for every door in the group. */
  const doorsIn = (group) => {
    if (!group) return [];
    const parts = new Map();
    group.children.forEach((mesh) => {
      const id = mesh.userData.doorId;
      if (id) parts.set(id, [...(parts.get(id) ?? []), mesh]);
    });
    return group.children
      .filter((mesh) => mesh.userData.kind === 'door')
      .map((panel) => ({ panel, parts: parts.get(panel.userData.componentId) ?? [] }));
  };

  return {
    /** Open a closed door or close an open one (animated). */
    toggle(id) {
      const door = entry(id);
      door.target = door.target === 1 ? 0 : 1;
    },
    isOpen: (id) => doors.get(id)?.target === 1,
    progressOf: (id) => doors.get(id)?.progress ?? 0,

    /** Apply the current poses to a freshly built group (no animation); forget doors that are gone. */
    attach(group) {
      const found = doorsIn(group);
      const present = new Set(found.map(({ panel }) => panel.userData.componentId));
      [...doors.keys()].forEach((id) => {
        if (!present.has(id)) doors.delete(id);
      });
      found.forEach(({ panel, parts }) => {
        const door = doors.get(panel.userData.componentId);
        if (door) applyDoorPose(panel, easeInOutCubic(door.progress), parts);
      });
    },

    /** Advance animations by `dtMs`. Returns true when any door moved this frame. */
    tick(dtMs, group) {
      let moved = false;
      const step = durationMs > 0 ? dtMs / durationMs : 1;
      doorsIn(group).forEach(({ panel, parts }) => {
        const door = doors.get(panel.userData.componentId);
        if (!door || door.progress === door.target) return;
        door.progress = door.target > door.progress
          ? Math.min(door.target, door.progress + step)
          : Math.max(door.target, door.progress - step);
        applyDoorPose(panel, easeInOutCubic(door.progress), parts);
        moved = true;
      });
      return moved;
    },
  };
}
