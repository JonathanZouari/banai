// Free-standing furniture in 3D (ADR-041): a bed, a chest of drawers, a desk and a standing mirror, as simple
// models at their measured size, on the room's floor at their place on the plan and their rotation. Each carries
// userData.furnitureIndex (its place in room.furniture) so a drag (dragTool.js) can move it. Visual only, part of
// the room overlay: hidden in renders and video.
import * as THREE from 'three';
import { toWardrobe } from '../domain/room.js';
import { toM } from './units.js';

function materialsFor() {
  return {
    wood: new THREE.MeshStandardMaterial({ color: '#c9a77e', roughness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: '#7d6550', roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.95 }),
    pillow: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8f8a83', roughness: 0.4, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe0ea', roughness: 0.05, metalness: 0.35 }),
  };
}

/** A box w (x) × h (y) × d (z) mm, its bottom at y0, centred at (x, z) in the piece's own frame. */
function block(material, w, h, d, x = 0, y0 = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(toM(w), toM(h), toM(d)), material);
  mesh.position.set(toM(x), toM(y0 + h / 2), toM(z));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** One piece in its own frame: width along x, depth along z (its front toward +z), standing on y = 0. */
export function furnitureParts({ type, width: w, depth: d, height: h }, m) {
  if (type === 'bed') { // a base, a mattress, a headboard at the back and two pillows
    const base = Math.max(120, h * 0.45);
    const head = Math.min(1100, h + 450);
    return [
      block(m.wood, w, base, d),
      block(m.fabric, w - 40, h - base, d - 60, 0, base, 30),
      block(m.dark, w, head, 60, 0, 0, -d / 2 + 30),
      block(m.pillow, w * 0.4, 120, 400, -w * 0.24, h, -d / 2 + 300),
      block(m.pillow, w * 0.4, 120, 400, w * 0.24, h, -d / 2 + 300),
    ];
  }
  if (type === 'dresser') { // a body, three drawer fronts and a plinth
    const parts = [block(m.wood, w, h - 60, d, 0, 60), block(m.dark, w - 40, 60, d - 40, 0, 0)];
    const rows = 3;
    const gap = (h - 60 - 40) / rows;
    for (let i = 0; i < rows; i += 1) parts.push(block(m.dark, w - 60, 8, 6, 0, 60 + 20 + gap * (i + 1) - 4, d / 2 + 3));
    return parts;
  }
  if (type === 'desk') { // a top on four legs
    const top = 30;
    const leg = 50;
    const parts = [block(m.wood, w, top, d, 0, h - top)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(block(m.metal, leg, h - top, leg, sx * (w / 2 - leg), 0, sz * (d / 2 - leg)));
    return parts;
  }
  if (type === 'mirror') { // a framed glass on a small foot
    const frame = 40;
    return [
      block(m.dark, w, h, Math.max(20, d / 2)),
      block(m.glass, w - 2 * frame, h - 2 * frame, 4, 0, frame, Math.max(10, d / 4) + 2),
      block(m.dark, w * 0.6, 20, Math.max(d, 250), 0, 0, 0),
    ];
  }
  return [block(m.wood, w, h, d)];
}

/** Every piece in the room, as one group in the wardrobe's frame, or null. dispose() frees what it made. */
export function buildFurniture(design) {
  const list = design.room?.furniture ?? [];
  if (!list.length) return null;
  const m = materialsFor();
  const group = new THREE.Group();
  group.name = 'room-furniture';
  list.forEach((f, index) => {
    const item = new THREE.Group();
    item.name = `room-furniture-${index}`;
    item.userData.furnitureIndex = index;
    furnitureParts(f, m).forEach((part) => item.add(part));
    const [x, z] = toWardrobe(design, [f.x, f.y]);
    item.position.set(toM(x), 0, toM(z));
    // The piece's width runs along the plan's x at rotation 0; its front faces the plan's +y (down on the plan).
    const r = ((f.rotation ?? 0) * Math.PI) / 180;
    const along = [Math.cos(r), Math.sin(r)]; // the piece's x on the plan
    const [ax, az] = toWardrobe(design, [f.x + along[0], f.y + along[1]]);
    item.rotation.y = Math.atan2(-(az - z), ax - x);
    group.add(item);
  });
  group.userData.dispose = () => {
    group.traverse((node) => node.geometry?.dispose());
    Object.values(m).forEach((material) => material.dispose());
  };
  return group;
}
