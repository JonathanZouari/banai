// Furniture, built in code from a few clean low-poly shapes: rounded boxes (soft edges), tapered
// cylinders and cones, smooth-shaded. No model files. Each piece is merged into one mesh per
// material, so a whole piece costs only a few draw calls. Built in its own frame: centred on the
// origin on the floor, back toward -z (the wall), front toward +z, in metres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FURNITURE } from './catalog.js';

/** Shared materials for all furniture (one set per room). `look` sets the soft furnishings. */
export function createFurnitureMaterials(look = {}) {
  const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  return {
    oak: std('#c49a6c', 0.55),
    walnut: std('#6e4d36', 0.5),
    white: std('#f1ede6', 0.6),
    linen: std('#efe9e0', 1),
    duvet: std(look.duvet ?? '#b9a48d', 1),
    accent: std(look.accent ?? '#8d9e86', 1),
    upholstery: std(look.upholstery ?? '#d8cbb8', 1),
    rug: std(look.rug ?? '#d9cdb9', 1),
    rugBorder: std(look.rugBorder ?? '#b8a58c', 1),
    metal: std('#2c2f34', 0.35, { metalness: 0.4 }),
    brass: std('#b08d57', 0.35, { metalness: 0.6 }),
    ceramic: std('#e6ddd0', 0.5),
    leaf: std('#4f7d4a', 0.75),
    leafLight: std('#7ba06a', 0.75),
    shade: std('#f3e9d8', 1, { emissive: '#ffcf8f', emissiveIntensity: 0 }),
    screen: new THREE.MeshStandardMaterial({ color: '#10151c', roughness: 0.2, emissive: '#29466b', emissiveIntensity: 0.55 }),
    rgb: new THREE.MeshBasicMaterial({ color: '#8b6cff', toneMapped: false }),
  };
}

// --- Shape helpers: every part is a geometry already moved into place, tagged with a material. ---
const rounded = (mat, w, h, d, x, y, z, radius = 0.02) => {
  const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return { mat, geometry: new RoundedBoxGeometry(w, h, d, 2, r).translate(x, y + h / 2, z) };
};
const cylinder = (mat, rTop, rBottom, h, x, y, z, segments = 16, open = false) => ({
  mat, geometry: new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open).translate(x, y + h / 2, z),
});
const leafBlade = (mat, height, width, x, z, tiltX, tiltZ) => {
  // A slender, flattened cone: a sansevieria-style leaf, smooth and upright.
  const geometry = new THREE.ConeGeometry(width, height, 8, 1);
  geometry.scale(1, 1, 0.28);
  geometry.translate(0, height / 2, 0);
  geometry.rotateX(tiltX);
  geometry.rotateZ(tiltZ);
  return { mat, geometry: geometry.translate(x, 0.33, z) };
};

const BUILDERS = {
  doubleBed: (m) => bed(m, 1.64, 2.1, true),
  singleBed: (m) => bed(m, 0.96, 2.1, false),
  nightstand(m) {
    return [
      rounded(m.oak, 0.46, 0.5, 0.4, 0, 0.04, 0, 0.015),
      rounded(m.walnut, 0.42, 0.04, 0.36, 0, 0, 0, 0.01), // recessed plinth: the box seems to float
      rounded(m.walnut, 0.36, 0.006, 0.01, 0, 0.3, 0.2, 0.002), // drawer line
      cylinder(m.ceramic, 0.05, 0.075, 0.2, 0.06, 0.54, -0.04, 16),
      cylinder(m.shade, 0.1, 0.13, 0.16, 0.06, 0.72, -0.04, 20, true),
    ];
  },
  desk(m) {
    return [
      rounded(m.oak, 1.2, 0.03, 0.6, 0, 0.73, 0, 0.012),
      rounded(m.white, 0.03, 0.73, 0.56, -0.57, 0, 0, 0.008),
      rounded(m.white, 0.42, 0.62, 0.56, 0.36, 0, 0, 0.012), // drawer unit
      rounded(m.walnut, 0.3, 0.006, 0.01, 0.36, 0.42, 0.28, 0.002),
    ];
  },
  gamingDesk(m) {
    const legs = [-0.62, 0.62].flatMap((x) => [rounded(m.metal, 0.05, 0.74, 0.6, x, 0, 0, 0.01)]);
    return [
      rounded(m.walnut, 1.4, 0.03, 0.7, 0, 0.74, 0, 0.012),
      ...legs,
      rounded(m.metal, 0.62, 0.36, 0.025, 0, 0.89, -0.2, 0.012), // monitor
      rounded(m.screen, 0.59, 0.33, 0.004, 0, 0.905, -0.186, 0.004),
      rounded(m.metal, 0.06, 0.15, 0.06, 0, 0.77, -0.24, 0.01), // stand
      rounded(m.metal, 0.44, 0.02, 0.14, -0.05, 0.77, 0.08, 0.008), // keyboard
      rounded(m.metal, 0.06, 0.02, 0.1, 0.3, 0.77, 0.1, 0.01), // mouse
      rounded(m.metal, 0.22, 0.48, 0.46, 0.55, 0, -0.08, 0.015), // PC tower on the floor beside the legs
      rounded(m.rgb, 0.006, 0.4, 0.006, 0.44, 0.04, 0.152, 0.002), // RGB strip: a soft violet glow line
    ];
  },
  chair: (m) => chair(m, 0.54, 0.96, m.accent),
  gamingChair: (m) => chair(m, 0.62, 1.3, m.metal),
  rug(m) {
    return [rounded(m.rugBorder, 2.0, 0.008, 1.4, 0, 0, 0, 0.004), rounded(m.rug, 1.88, 0.01, 1.28, 0, 0, 0, 0.004)];
  },
  floorLamp(m) {
    return [
      cylinder(m.brass, 0.15, 0.16, 0.025, 0, 0, 0, 24),
      cylinder(m.brass, 0.012, 0.012, 1.38, 0, 0.025, 0, 8),
      cylinder(m.shade, 0.17, 0.19, 0.24, 0, 1.38, 0, 24, true),
    ];
  },
  plant(m) {
    const leaves = [[0, 0, 0.05, 0.02, 0.62], [0.05, 0.04, -0.12, 0.16, 0.5], [-0.06, 0.03, 0.08, -0.18, 0.56], [0.03, -0.06, 0.18, 0.06, 0.44], [-0.04, -0.05, -0.15, -0.08, 0.48], [0.07, -0.01, 0.02, 0.24, 0.38], [-0.08, 0.05, -0.04, -0.26, 0.4]];
    return [
      cylinder(m.ceramic, 0.17, 0.13, 0.34, 0, 0, 0, 24),
      cylinder(m.walnut, 0.155, 0.155, 0.01, 0, 0.31, 0, 20),
      ...leaves.map(([x, z, tx, tz, hgt], i) => leafBlade(i % 2 ? m.leafLight : m.leaf, hgt + 0.2, 0.045, x, z, tx, tz)),
    ];
  },
};

function bed(m, width, length, double) {
  const half = length / 2;
  const parts = [
    rounded(m.walnut, width - 0.12, 0.08, length - 0.2, 0, 0, 0.02, 0.01), // recessed plinth
    rounded(m.oak, width, 0.22, length - 0.06, 0, 0.08, 0.03, 0.02), // frame
    rounded(m.linen, width - 0.06, 0.2, length - 0.16, 0, 0.3, 0.05, 0.06), // mattress
    rounded(m.duvet, width - 0.02, 0.06, length * 0.62, 0, 0.47, half - length * 0.31 - 0.04, 0.03),
    rounded(m.upholstery, width, 0.88, 0.08, 0, 0, -half + 0.04, 0.035), // upholstered headboard
  ];
  const pillows = double ? [-width / 4, width / 4] : [0];
  pillows.forEach((x) => parts.push(rounded(m.linen, double ? 0.6 : 0.62, 0.12, 0.38, x, 0.49, -half + 0.32, 0.055)));
  if (double) parts.push(rounded(m.accent, width - 0.02, 0.025, 0.36, 0, 0.53, half - 0.36, 0.012)); // throw across the foot
  return parts;
}

function chair(m, size, height, fabric) {
  const star = [0, 72, 144, 216, 288].map((deg) => {
    const geometry = new RoundedBoxGeometry(0.03, 0.03, size * 0.48, 2, 0.01);
    geometry.translate(0, 0.04, size * 0.24);
    geometry.rotateY(THREE.MathUtils.degToRad(deg));
    return { mat: m.metal, geometry };
  });
  return [
    ...star,
    cylinder(m.metal, 0.025, 0.025, 0.36, 0, 0.05, 0, 10),
    rounded(fabric, size * 0.86, 0.08, size * 0.82, 0, 0.41, 0.02, 0.035), // seat
    rounded(fabric, size * 0.82, height - 0.5, 0.08, 0, 0.5, -size * 0.38, 0.035), // back
  ];
}

/** One piece of furniture as a group: one merged mesh per material, plus its contact shadow. */
export function buildFurniture(kind, materials) {
  const parts = BUILDERS[kind](materials);
  const byMaterial = new Map();
  parts.forEach(({ mat, geometry }) => {
    const list = byMaterial.get(mat) ?? [];
    list.push(geometry.index ? geometry.toNonIndexed() : geometry); // shapes differ in indexing; merge needs one kind
    if (geometry.index) geometry.dispose();
    byMaterial.set(mat, list);
  });
  const group = new THREE.Group();
  group.name = kind;
  byMaterial.forEach((geometries, material) => {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.furniture = kind;
    group.add(mesh);
  });
  group.userData = { kind, ...FURNITURE[kind] };
  return group;
}

export const FURNITURE_KINDS = Object.freeze(Object.keys(BUILDERS));
