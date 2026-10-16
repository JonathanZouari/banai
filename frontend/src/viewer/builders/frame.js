// Derived frame measurements (mm) shared by the builders, plus a box-mesh helper.
// Coordinates: x = 0 at the outer left face, y = 0 at the floor, the front face at
// z = 0 and the back at z = -depth.
import * as THREE from 'three';
import { compartmentXRanges, interiorHeight, interiorWidth } from '../../domain/geometry.js';
import { VISUAL, toM } from '../units.js';

export function frameOf(design) {
  const { width, height, depth } = design.dimensions;
  const panel = design.carcass.panelThickness;
  const innerDepth = depth - VISUAL.backThickness;
  return {
    width, height, depth, panel, innerDepth,
    innerWidth: interiorWidth(design),
    innerHeight: interiorHeight(design),
    // Interior x-range of each compartment, shifted to outer coordinates.
    ranges: compartmentXRanges(design).map(([x0, x1]) => [panel + x0, panel + x1]),
    innerCenterZ: -innerDepth / 2,
  };
}

// Wood-grain UV scale: one texture repeat per 1.2 m along the grain (long axis) and per 0.6 m across it.
const GRAIN_U_PER_M = 1 / 1.2;
const GRAIN_V_PER_M = 1 / 0.6;

function cellHash(a, b, c) {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Per-face UVs in metres: u runs along each face's longer in-plane axis; a per-panel offset varies the grain. */
function applyGrainUVs(geometry, size, [x, y, z]) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const offsetU = cellHash(Math.round(x), Math.round(y), Math.round(z));
  const offsetV = cellHash(Math.round(z), Math.round(x), Math.round(y) + 1);
  for (let i = 0; i < position.count; i += 1) {
    const axis = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))].indexOf(1);
    const [a, b] = [0, 1, 2].filter((k) => k !== axis);
    const [long, short] = size[a] >= size[b] ? [a, b] : [b, a];
    const coord = (k) => [position.getX(i), position.getY(i), position.getZ(i)][k];
    uv.setXY(i, coord(long) * GRAIN_U_PER_M + offsetU, coord(short) * GRAIN_V_PER_M + offsetV);
  }
  uv.needsUpdate = true;
}

/** A box mesh from a size and centre given in millimetres. */
export function box({ size: [w, h, d], center: [x, y, z], material, userData }) {
  const geometry = new THREE.BoxGeometry(toM(w), toM(h), toM(d));
  applyGrainUVs(geometry, [toM(w), toM(h), toM(d)], [x, y, z]);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(toM(x), toM(y), toM(z));
  mesh.userData = { ...userData };
  return mesh;
}
