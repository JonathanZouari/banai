// Decorative clothes for the wardrobe interior. Pure and Node-safe; nothing here is raycastable
// and nothing goes into the wardrobe group. Deterministic for a seed (no Math.random).
// Garments hang from rails and pull-down rails, folded stacks sit on shelves, shoes on the shoe
// shelves and trousers over the trouser rack (the inserts' hardware is built in builders/inserts.js).
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { SHOE_TILT, insertZone, shoeShelf, trouserRack } from './builders/inserts.js';
import { toM } from './units.js';

const noRaycast = () => {};
// Upper bound on decorative meshes, so a valid but extreme design (e.g. hundreds of rails from
// an LLM) can't flood the scene; props are rebuilt on every design change.
export const MAX_PROP_MESHES = 600;
const PALETTE = ['#6f7f8f', '#8c7b6b', '#59636e', '#a3917a', '#7a8a7a', '#4e5560', '#b0a79a', '#7b6a72'];
const SHOE_COLORS = ['#3b2a20', '#e9e7e2', '#20232a', '#8a5a3c']; // P1
const SHOE_PITCH = 220; // mm per pair along the shelf
const SHOE = Object.freeze({ width: 85, height: 75, length: 260 });

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interior y-ranges [bottom, top] of everything solid in a compartment (shelves, drawers, zone inserts). */
function solids(compartment) {
  return [
    ...compartment.shelves.map((s) => [s.y, s.y + s.thickness]),
    ...compartment.drawers.map((d) => [d.y, d.y + d.height]),
    ...(compartment.inserts ?? []).filter((i) => i.type === 'shoes' || i.type === 'trousers').map(insertZone),
  ];
}

export function buildProps(design, { seed = 1 } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  group.name = 'props';
  const materials = PALETTE.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
  const shoeMaterials = SHOE_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }));
  const hangerMaterial = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.6, metalness: 0.2 });
  group.userData.materials = [...materials, ...shoeMaterials, hangerMaterial];
  const pick = () => materials[Math.floor(random() * materials.length)];
  const room = (count) => group.children.length + count <= MAX_PROP_MESHES;
  const add = (mesh, part) => {
    mesh.raycast = noRaycast;
    mesh.userData = { part, decorative: true };
    group.add(mesh);
    return mesh;
  };

  const frame = frameOf(design);
  const base = frame.baseY;
  design.compartments.forEach((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const width = x1 - x0;
    const cz = toM(frame.innerCenterZ);
    const inserts = compartment.inserts ?? [];

    // Hanging garments on rails and the pull-down rail, clamped above the next surface below.
    const hangers = [...compartment.rails.map((rail) => rail.y), ...inserts.filter((i) => i.type === 'pulldown').map((i) => i.y)];
    hangers.forEach((railY) => {
      const floorTop = Math.max(0, ...solids(compartment).map(([, top]) => top).filter((top) => top <= railY));
      const available = railY - 30 - floorTop - 20;
      if (available < 250) return;
      const count = Math.min(40, Math.floor((width - 40) / 70));
      for (let i = 0; i < count; i += 1) {
        if (!room(2)) return;
        const x = x0 + 20 + ((i + 0.5) * (width - 40)) / count;
        const jacket = random() < 0.3;
        const h = Math.min(jacket ? 950 : 750, available);
        const w = Math.min(jacket ? 500 : 450, 62);
        const d = 40 + Math.floor(random() * 40);
        const top = base + railY - 30;
        add(new THREE.Mesh(new THREE.TorusGeometry(toM(25), toM(2), 6, 12), hangerMaterial), 'hanger')
          .position.set(toM(x), toM(base + railY), cz);
        const body = add(new THREE.Mesh(new THREE.BoxGeometry(toM(w), toM(h), toM(d)), pick()), 'garment');
        body.position.set(toM(x), toM(top - h / 2), cz);
      }
    });

    // Folded stacks on shelves with enough clearance above.
    compartment.shelves.forEach((shelf) => {
      const top = shelf.y + shelf.thickness;
      const above = [frame.innerHeight, ...solids(compartment).map(([bottom]) => bottom).filter((bottom) => bottom > shelf.y)];
      const clearance = Math.min(...above) - top;
      if (clearance < 150) return;
      const stacks = Math.min(1 + Math.floor(random() * 3), Math.max(1, Math.floor(width / 330)));
      const footprint = Math.min(300, width / stacks - 30);
      if (footprint < 100) return;
      for (let s = 0; s < stacks; s += 1) {
        const x = x0 + ((s + 0.5) * width) / stacks;
        let y = top;
        const material = pick();
        while (room(1)) {
          const layer = 40 + Math.floor(random() * 40);
          if (y + layer - top > clearance - 30) break;
          const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(toM(footprint), toM(layer - 2), toM(250)), material), 'stack');
          mesh.position.set(toM(x), toM(base + y + layer / 2), cz);
          y += layer;
        }
      }
    });

    // Shoe pairs resting on each sloped shoe shelf, toes 20 mm behind its low front edge.
    inserts.filter((i) => i.type === 'shoes').forEach((insert) => {
      const pairs = Math.floor((width - 40) / SHOE_PITCH);
      const first = x0 + (width - pairs * SHOE_PITCH) / 2 + SHOE_PITCH / 2;
      for (let k = 0; k < insert.tiers; k += 1) {
        const shelf = shoeShelf(frame, insert, k);
        const at = shelf.surface(Math.max(0, shelf.depth / 2 - 20 - SHOE.length / 2), SHOE.height / 2);
        for (let p = 0; p < pairs; p += 1) {
          if (!room(2)) return;
          const material = shoeMaterials[(p + k) % shoeMaterials.length];
          for (const side of [-1, 1]) {
            const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(toM(SHOE.width), toM(SHOE.height), toM(SHOE.length)), material), 'shoe');
            shoe.position.set(toM(first + p * SHOE_PITCH + side * 48), toM(at.y), toM(at.z));
            shoe.rotation.x = SHOE_TILT;
          }
        }
      }
    });

    // Trousers folded over every other bar of the trouser rack, hanging down into the zone.
    inserts.filter((i) => i.type === 'trousers').forEach((insert) => {
      const rack = trouserRack(frame, insert, x0, x1);
      const length = Math.min(620, insert.height - 80);
      if (length < 120) return;
      for (let b = 0; b < rack.barXs.length; b += 2) {
        if (!room(1)) return;
        const trouser = add(new THREE.Mesh(new THREE.BoxGeometry(toM(16), toM(length), toM(Math.min(280, rack.depth))), pick()), 'trousers');
        trouser.position.set(toM(rack.barXs[b]), toM(rack.barY - length / 2), toM(rack.zc));
      }
    });
  });
  return group;
}

export function disposeProps(group) {
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
  });
  (group.userData.materials ?? []).forEach((material) => material.dispose());
}
