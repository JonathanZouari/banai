// Handle geometry for door / drawer fronts. Pure and Node-safe. Every handle is ONE Group
// (userData.part = 'handle') that is a child of its front mesh and is never raycast.
// Built vertical (long axis = y) with its origin on the front face, extending toward +z.
// A door handle sits at the usual height when its door spans it; on a shorter (zone) door it is
// clamped into the door: near the bottom edge of an upper door, near the top edge of a lower one.
import * as THREE from 'three';
import { VISUAL, toM } from '../units.js';
import { hingedDoorRects } from './doors.js';
import { frameOf } from './frame.js';

const noRaycast = () => {};
const SEGMENTS = 16;
export const HANDLE_EDGE_CLEARANCE = 110; // mm from a door's edge to the handle's centre

/**
 * Height (mm above the floor) of the handle centre on a door spanning [bottom, top]: the usual
 * handle height when the door spans it, else as close to it as the door allows, at least
 * HANDLE_EDGE_CLEARANCE inside the door's edges (the middle of a door too short for that).
 */
export function doorHandleY(bottom, top, usual = VISUAL.handleHeightFromFloor) {
  const middle = (bottom + top) / 2;
  const reach = Math.max(0, (top - bottom) / 2 - HANDLE_EDGE_CLEARANCE);
  return middle + Math.max(-reach, Math.min(reach, usual - middle));
}

const cylinder = (radius, length, material) =>
  new THREE.Mesh(new THREE.CylinderGeometry(toM(radius), toM(radius), toM(length), SEGMENTS), material);
const alongZ = (mesh, z) => {
  mesh.geometry.rotateX(Math.PI / 2);
  mesh.position.z = toM(z);
  return mesh;
};

function parts(style, material, darkMaterial) {
  switch (style) {
    case 'bar': {
      const rod = cylinder(6, 160, material);
      rod.position.z = toM(31);
      const standoffs = [-60, 60].map((y) => {
        const s = alongZ(cylinder(4, 25, material), 12.5);
        s.position.y = toM(y);
        return s;
      });
      return [rod, ...standoffs];
    }
    case 'knob':
      return [alongZ(cylinder(4, 15, material), 7.5), alongZ(cylinder(15, 12, material), 21)];
    case 'edge': {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(toM(20), toM(180), toM(8)), material);
      bar.position.z = toM(4);
      return [bar];
    }
    case 'cup': {
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(toM(12), toM(12), toM(96), SEGMENTS, 1, false, -Math.PI / 2, Math.PI), material);
      shell.position.z = toM(1);
      return [shell];
    }
    case 'groove': {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(toM(12), toM(160), toM(1)), darkMaterial);
      strip.position.z = toM(0.4);
      return [strip];
    }
    default:
      return [];
  }
}

/** A handle group, or null for style 'none'. orientation: 'vertical' | 'horizontal'. */
export function buildHandle({ style, finish }, hardware, orientation, owner) {
  if (!style || style === 'none') return null;
  const group = new THREE.Group();
  group.name = `handle-${style}`;
  parts(style, hardware.handle(finish), hardware.handle('black')).forEach((mesh) => {
    mesh.raycast = noRaycast;
    group.add(mesh);
  });
  if (orientation === 'horizontal') group.rotation.z = Math.PI / 2;
  group.raycast = noRaycast;
  group.userData = { componentId: owner.componentId, kind: owner.kind, part: 'handle', style };
  return group;
}

/** A thin mirror plane covering a door face minus a 6 mm margin. Sizes in metres. */
export function buildMirror(width, height, thickness, hardware, owner) {
  const margin = toM(12);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width - margin, height - margin), hardware.mirror);
  mesh.position.z = thickness / 2 + toM(0.5);
  mesh.raycast = noRaycast;
  mesh.userData = { componentId: owner.componentId, kind: owner.kind, part: 'mirror' };
  return mesh;
}

/**
 * Whether a drawer is behind a door (it then has no handle of its own): every drawer behind sliding
 * panels, and behind a hinged door whose compartment and height span (a zone door) cover it.
 */
function drawerCover(design, doorsVisible) {
  const { doors } = design;
  if (!doorsVisible || doors.type === 'none') return () => false;
  if (doors.type === 'sliding') return () => doors.items.length > 0;
  const frame = frameOf(design);
  const rects = hingedDoorRects(design, frame);
  return (compartmentId, drawer) => {
    const [y0, y1] = [frame.baseY + drawer.y, frame.baseY + drawer.y + drawer.height];
    return rects.some((r) => r.door.compartmentIds.includes(compartmentId) && r.y0 < y1 && r.y0 + r.height > y0);
  };
}

/** Add handles (and mirrors) as children of the front meshes of a built wardrobe group. */
export function addFrontHardware(group, design, hardware, { doorsVisible }) {
  const { doors } = design;
  const covered = drawerCover(design, doorsVisible);
  const doorOf = new Map(doors.items.map((d) => [d.id, d]));
  const drawerOf = new Map(design.compartments.flatMap((c) => c.drawers.map((d) => [d.id, d])));

  group.children.slice().forEach((mesh) => {
    const owner = { componentId: mesh.userData.componentId, kind: mesh.userData.kind };
    // Drawers are merged open boxes: their outer size (m) is in userData.size.
    const [w, h, t] = mesh.userData.size
      ?? [mesh.geometry.parameters?.width, mesh.geometry.parameters?.height, mesh.geometry.parameters?.depth];
    if (mesh.userData.kind === 'door') {
      const door = doorOf.get(owner.componentId);
      if (!door) return;
      if (door.mirror) mesh.add(buildMirror(w, h, t, hardware, owner));
      const spec = door.handle ?? design.handles;
      let side = 1; // +1 = right edge
      if (doors.type === 'hinged') side = mesh.userData.hingeSide === 'right' ? -1 : 1;
      else if (mesh.userData.slide) side = mesh.userData.slide.index < mesh.userData.slide.count / 2 ? -1 : 1;
      const handle = buildHandle(spec, hardware, 'vertical', owner);
      if (!handle) return;
      const inset = toM(spec.style === 'edge' ? 10 : 50);
      const bottom = mesh.position.y - h / 2; // closed pose: the door's own span, in metres
      const y = toM(doorHandleY(bottom * 1000, (bottom + h) * 1000)) - mesh.position.y;
      handle.position.set(side * (w / 2 - inset), y, t / 2);
      mesh.add(handle);
    } else if (mesh.userData.kind === 'drawer') {
      const drawer = drawerOf.get(owner.componentId);
      if (!drawer || covered(mesh.userData.compartmentId, drawer)) return;
      const spec = drawer.handle ?? design.handles;
      const handle = buildHandle(spec, hardware, 'horizontal', owner);
      if (!handle) return;
      const top = spec.style === 'edge' || spec.style === 'groove';
      handle.position.set(0, top ? h / 2 - toM(12) : 0, t / 2);
      mesh.add(handle);
    }
  });
}
