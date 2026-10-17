// Advisory "show" flash: a brief accent pulse over the parts an advisory talks about.
// Targets are strings: 'carcass', 'door:<doorId>', 'comp:<index>'. Resolution is pure (Node-
// testable); the flasher owns the overlay meshes, which live in their own layer, draw on top of
// everything (so an interior target shows through closed doors) and are never raycast.
import * as THREE from 'three';
import { doorRects } from './builders/doors.js';
import { frameOf } from './builders/frame.js';
import { ACCENT, compartmentBox } from './highlight.js';
import { VISUAL, toM } from './units.js';

export const FLASH_MS = 1200;
const PAD = 0.005; // m around each box, so the outline clears the surfaces it wraps
const FILL_OPACITY = 0.16;
const LINE_OPACITY = 0.95;
const STATIC = 0.75; // reduced motion: a steady highlight at this share of the peak
const noRaycast = () => {};

/** World box (metres) of a door: its mesh as posed now, else its closed layout rectangle. */
function doorBox(design, group, id) {
  const mesh = group?.children.find((child) => child.userData.componentId === id && child.userData.kind === 'door');
  if (mesh) return new THREE.Box3().setFromObject(mesh);
  const rect = doorRects(design, frameOf(design)).find((r) => r.door.id === id);
  if (!rect) return null;
  return new THREE.Box3(
    new THREE.Vector3(toM(rect.x0), toM(rect.y0), toM(rect.z0)),
    new THREE.Vector3(toM(rect.x0 + rect.width), toM(rect.y0 + rect.height), toM(rect.z0 + VISUAL.doorThickness)),
  );
}

/**
 * Resolve flash targets to world boxes: [{ target, box }]. Unknown, malformed or duplicate
 * targets are skipped, so a stale advisory never throws.
 */
export function resolveFlashTargets(targets, design, group = null) {
  if (!Array.isArray(targets) || !design) return [];
  const resolved = [];
  for (const target of new Set(targets)) {
    if (typeof target !== 'string') continue;
    let box = null;
    if (target === 'carcass') {
      const { width, height, depth } = design.dimensions;
      box = new THREE.Box3(new THREE.Vector3(0, 0, -toM(depth)), new THREE.Vector3(toM(width), toM(height), 0));
    } else if (target.startsWith('door:')) {
      box = doorBox(design, group, target.slice(5));
    } else if (/^comp:\d+$/.test(target)) {
      box = compartmentBox(design, Number(target.slice(5)));
    }
    if (box && !box.isEmpty()) resolved.push({ target, box });
  }
  return resolved;
}

/** Opacity factor 0..1 of a flash `elapsed` ms in: one smooth pulse, or a steady level with reduced motion. */
export function flashLevel(elapsed, reducedMotion = false) {
  if (!(elapsed >= 0) || elapsed >= FLASH_MS) return 0;
  return reducedMotion ? STATIC : Math.sin((Math.PI * elapsed) / FLASH_MS);
}

export function createFlasher(scene) {
  const layer = new THREE.Group();
  layer.name = 'flash';
  scene.add(layer);
  const fill = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
  let started = null;
  let reduced = false;

  const clear = () => {
    layer.children.forEach((child) => child.geometry.dispose());
    layer.clear();
    started = null;
  };

  const setLevel = (level) => {
    fill.opacity = FILL_OPACITY * level;
    lines.opacity = LINE_OPACITY * level;
  };

  return {
    /** Replace any running flash with one over `boxes` ([{ box }]); returns how many parts flash. */
    show(boxes, { now = performance.now(), reducedMotion = false } = {}) {
      clear();
      boxes.forEach(({ box }) => {
        const size = box.getSize(new THREE.Vector3()).addScalar(2 * PAD);
        const center = box.getCenter(new THREE.Vector3());
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const volume = new THREE.Mesh(geometry, fill);
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lines);
        [volume, outline].forEach((object, i) => {
          object.position.copy(center);
          object.renderOrder = 11 + i;
          object.raycast = noRaycast;
          layer.add(object);
        });
      });
      if (!layer.children.length) return 0;
      started = now;
      reduced = reducedMotion;
      setLevel(flashLevel(0, reduced));
      return boxes.length;
    },
    /** Advance the pulse; removes the overlays when it ends. */
    step(now = performance.now()) {
      if (started === null) return;
      if (now - started >= FLASH_MS) clear();
      else setLevel(flashLevel(now - started, reduced));
    },
    get active() { return started !== null; },
    get count() { return layer.children.length / 2; },
    clear,
    dispose() {
      clear();
      scene.remove(layer);
      fill.dispose();
      lines.dispose();
    },
  };
}
