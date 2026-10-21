// Open/close animation for doors and drawers. Purely visual: nothing here touches the
// design or the store, and the open state is forgotten on reload. It moves the meshes that
// buildWardrobe already made (no scene rebuild), and has no WebGL/DOM so it runs in Node tests.
//   - hinged door: swings outward around its hinge edge
//   - sliding door: slides sideways over/behind its neighbour
//   - drawer: pulls out toward the viewer
import * as THREE from 'three';
import { VISUAL, toM } from './units.js';

export const HINGE_OPEN_RAD = (105 * Math.PI) / 180;
export const DRAWER_TRAVEL = 0.7; // fraction of the drawer's depth
const SECONDS_TO_OPEN = 0.6;

const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => t * t * (3 - 2 * t);

export const isOpenable = (kind) => kind === 'door' || kind === 'drawer';

function sizeOf(mesh) {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getSize(new THREE.Vector3());
}

/** How one door/drawer moves, or null when it has nowhere to go (e.g. a single sliding panel). */
function motionOf(mesh, design) {
  const { kind, hingeSide, componentId } = mesh.userData;
  const size = sizeOf(mesh);
  if (kind === 'drawer') return { type: 'slide', axis: new THREE.Vector3(0, 0, 1), distance: size.z * DRAWER_TRAVEL };
  if (hingeSide) {
    const pivot = mesh.position.clone();
    pivot.x += hingeSide === 'left' ? -size.x / 2 : size.x / 2;
    // Rotating about +Y swings a point at +x toward -z, so a left hinge needs a negative angle.
    return { type: 'hinge', pivot, angle: hingeSide === 'left' ? -HINGE_OPEN_RAD : HINGE_OPEN_RAD };
  }
  const { items } = design.doors;
  const index = items.findIndex((door) => door.id === componentId);
  if (items.length < 2 || index < 0) return null;
  const step = size.x - toM(VISUAL.slidingOverlap);
  // Back-track panels tuck behind the next one; front-track panels slide over the previous one.
  const direction = index === items.length - 1 || index % 2 === 1 ? -1 : 1;
  return { type: 'slide', axis: new THREE.Vector3(1, 0, 0), distance: direction * step };
}

export function createOpener() {
  let parts = []; // { mesh, id, base }
  let motions = new Map(); // component id -> motion
  const progress = new Map(); // component id -> { value, target }, survives scene rebuilds

  const pose = ({ mesh, id, base }) => {
    const motion = motions.get(id);
    const p = ease(progress.get(id)?.value ?? 0);
    if (motion.type === 'hinge') {
      const angle = motion.angle * p;
      mesh.position.copy(base).sub(motion.pivot).applyAxisAngle(UP, angle).add(motion.pivot);
      mesh.rotation.y = angle;
    } else {
      mesh.position.copy(base).addScaledVector(motion.axis, motion.distance * p);
    }
  };

  return {
    /** Index the freshly built meshes and re-apply any open state to them straight away. */
    attach(group, design) {
      motions = new Map();
      group.children.forEach((mesh) => {
        if (!isOpenable(mesh.userData.kind)) return;
        const motion = motionOf(mesh, design);
        if (motion) motions.set(mesh.userData.componentId, motion);
      });
      parts = group.children
        .map((mesh) => ({ mesh, id: mesh.userData.doorId ?? mesh.userData.componentId, base: mesh.position.clone() }))
        .filter(({ mesh, id }) => motions.has(id) && (mesh.userData.doorId !== undefined || isOpenable(mesh.userData.kind)));
      [...progress.keys()].filter((id) => !motions.has(id)).forEach((id) => progress.delete(id));
      parts.forEach(pose);
    },

    /** Flip a door/drawer between open and closed. False when the id cannot move. */
    toggle(id) {
      if (!motions.has(id)) return false;
      const entry = progress.get(id) ?? { value: 0, target: 0 };
      entry.target = entry.target === 1 ? 0 : 1;
      progress.set(id, entry);
      return true;
    },

    closeAll() {
      progress.forEach((entry) => { entry.target = 0; });
    },

    isOpen: (id) => progress.get(id)?.target === 1,
    canOpen: (id) => motions.has(id),

    /** Advance the animation by `seconds`; true while something moved (a redraw is needed). */
    step(seconds) {
      const moving = [...progress.entries()].filter(([, entry]) => entry.value !== entry.target);
      moving.forEach(([, entry]) => {
        const delta = seconds / SECONDS_TO_OPEN;
        entry.value = entry.target > entry.value ? Math.min(entry.target, entry.value + delta) : Math.max(entry.target, entry.value - delta);
      });
      const ids = new Set(moving.map(([id]) => id));
      parts.filter((part) => ids.has(part.id)).forEach(pose);
      return moving.length > 0;
    },
  };
}
