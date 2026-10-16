// Decorative clothes for the wardrobe interior. Pure and Node-safe; nothing here is raycastable
// and nothing goes into the wardrobe group. Deterministic for a seed (no Math.random).
import * as THREE from 'three';
import { frameOf } from './builders/frame.js';
import { toM } from './units.js';

const noRaycast = () => {};
// Upper bound on decorative meshes, so a valid but extreme design (e.g. hundreds of rails from
// an LLM) can't flood the scene; props are rebuilt on every design change.
export const MAX_PROP_MESHES = 600;
const PALETTE = ['#6f7f8f', '#8c7b6b', '#59636e', '#a3917a', '#7a8a7a', '#4e5560', '#b0a79a', '#7b6a72'];

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

export function buildProps(design, { seed = 1 } = {}) {
  const random = rng(seed);
  const group = new THREE.Group();
  group.name = 'props';
  const materials = PALETTE.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
  const hangerMaterial = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.6, metalness: 0.2 });
  group.userData.materials = [...materials, hangerMaterial];
  const pick = () => materials[Math.floor(random() * materials.length)];
  const add = (mesh, part) => {
    mesh.raycast = noRaycast;
    mesh.userData = { part, decorative: true };
    group.add(mesh);
    return mesh;
  };

  const frame = frameOf(design);
  design.compartments.forEach((compartment, ci) => {
    const [x0, x1] = frame.ranges[ci];
    const width = x1 - x0;
    const cz = toM(frame.innerCenterZ);

    // Hanging garments, clamped above the next surface below the rail.
    compartment.rails.forEach((rail) => {
      const floorTop = Math.max(0, ...compartment.shelves.filter((s) => s.y + s.thickness <= rail.y).map((s) => s.y + s.thickness),
        ...compartment.drawers.filter((d) => d.y + d.height <= rail.y).map((d) => d.y + d.height));
      const available = rail.y - 30 - floorTop - 20;
      if (available < 250) return;
      const count = Math.min(40, Math.floor((width - 40) / 70));
      for (let i = 0; i < count; i += 1) {
        if (group.children.length + 2 > MAX_PROP_MESHES) return;
        const x = x0 + 20 + ((i + 0.5) * (width - 40)) / count;
        const jacket = random() < 0.3;
        const h = Math.min(jacket ? 950 : 750, available);
        const w = Math.min(jacket ? 500 : 450, 62);
        const d = 40 + Math.floor(random() * 40);
        const top = frame.panel + rail.y - 30;
        add(new THREE.Mesh(new THREE.TorusGeometry(toM(25), toM(2), 6, 12), hangerMaterial), 'hanger')
          .position.set(toM(x), toM(frame.panel + rail.y), cz);
        const body = add(new THREE.Mesh(new THREE.BoxGeometry(toM(w), toM(h), toM(d)), pick()), 'garment');
        body.position.set(toM(x), toM(top - h / 2), cz);
      }
    });

    // Folded stacks on shelves with enough clearance above.
    compartment.shelves.forEach((shelf) => {
      const top = shelf.y + shelf.thickness;
      const above = [
        frame.innerHeight,
        ...compartment.shelves.filter((s) => s.y > shelf.y).map((s) => s.y),
        ...compartment.drawers.filter((d) => d.y > shelf.y).map((d) => d.y),
      ];
      const clearance = Math.min(...above) - top;
      if (clearance < 150) return;
      const stacks = Math.min(1 + Math.floor(random() * 3), Math.max(1, Math.floor(width / 330)));
      const footprint = Math.min(300, width / stacks - 30);
      if (footprint < 100) return;
      for (let s = 0; s < stacks; s += 1) {
        const x = x0 + ((s + 0.5) * width) / stacks;
        let y = top;
        const material = pick();
        while (group.children.length < MAX_PROP_MESHES) {
          const layer = 40 + Math.floor(random() * 40);
          if (y + layer - top > clearance - 30) break;
          const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(toM(footprint), toM(layer - 2), toM(250)), material), 'stack');
          mesh.position.set(toM(x), toM(frame.panel + y + layer / 2), cz);
          y += layer;
        }
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
