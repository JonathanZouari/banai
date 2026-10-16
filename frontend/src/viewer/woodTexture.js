// Procedural wood grain: a near-white greyscale tileable texture that MULTIPLIES the material
// colour (it only darkens by up to ~22 %), so the catalog hex stays the base colour. Pure maths
// into a Uint8Array (THREE.DataTexture), so it runs in Node and is deterministic per grain + seed.
// Grain lines run along the texture's u axis (x); noise is periodic so the texture tiles.
import * as THREE from 'three';

const MIN_VALUE = 0.78;
const BASE_VALUE = 0.98;

// ring = growth rings across the grain; warp = ring wobble (cathedral arches); contrast/sharp = ring darkness
// and edge hardness; fibre = fine streak density; pores/flecks/streaks = species features.
const RECIPES = Object.freeze({
  oak: { rings: 12, warp: 0.8, warpU: 2, warpV: 6, contrast: 0.7, sharp: 3, fibre: 200, fibreAmt: 0.25, pores: 0.6, flecks: 0.5, streaks: 0, streakCells: 8 },
  ash: { rings: 9, warp: 0.2, warpU: 2, warpV: 4, contrast: 1, sharp: 2.5, fibre: 240, fibreAmt: 0.2, pores: 0.15, flecks: 0, streaks: 0, streakCells: 8 },
  cherry: { rings: 24, warp: 0.3, warpU: 2, warpV: 5, contrast: 0.4, sharp: 2, fibre: 256, fibreAmt: 0.15, pores: 0, flecks: 0, streaks: 0, streakCells: 8 },
  teak: { rings: 14, warp: 0.15, warpU: 2, warpV: 4, contrast: 0.5, sharp: 2, fibre: 200, fibreAmt: 0.25, pores: 0, flecks: 0, streaks: 0.7, streakCells: 14 },
  wenge: { rings: 18, warp: 0.1, warpU: 2, warpV: 4, contrast: 1.2, sharp: 1.2, fibre: 256, fibreAmt: 0.35, pores: 0, flecks: 0, streaks: 0, streakCells: 8 },
  walnut: { rings: 7, warp: 1.8, warpU: 2, warpV: 5, contrast: 0.8, sharp: 2, fibre: 220, fibreAmt: 0.25, pores: 0.2, flecks: 0, streaks: 0, streakCells: 8 },
});

export const WOOD_GRAINS = Object.freeze(Object.keys(RECIPES));

function hash(a, b, seed) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Periodic value noise on a cx x cy lattice; x and y in [0, 1). */
function noise(x, y, cx, cy, seed) {
  const gx = x * cx;
  const gy = y * cy;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = smooth(gx - ix);
  const fy = smooth(gy - iy);
  const x1 = (ix + 1) % cx;
  const y1 = (iy + 1) % cy;
  const a = hash(ix, iy, seed);
  const b = hash(x1, iy, seed);
  const c = hash(ix, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x, y, cx, cy, octaves, seed) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amplitude * noise(x, y, cx << o, cy << o, seed + o * 31);
    total += amplitude;
    amplitude *= 0.5;
  }
  return sum / total;
}

function grainSeed(grain) {
  let h = 2166136261;
  for (let i = 0; i < grain.length; i += 1) h = Math.imul(h ^ grain.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sample(r, u, v, seed) {
  const warp = (fbm(u, v, r.warpU, r.warpV, 2, seed + 1) - 0.5) * 2 * r.warp;
  const t = v * r.rings + warp;
  const ring = Math.floor(t);
  const f = t - ring;
  const strength = 0.55 + 0.45 * hash(((ring % r.rings) + r.rings) % r.rings, 7, seed);
  let dark = Math.pow(f, r.sharp) * strength * r.contrast;
  dark += (fbm(u, v, 6, r.fibre, 2, seed + 2) - 0.5) * r.fibreAmt;
  if (r.pores) dark += Math.max(0, noise(u, v, 48, 256, seed + 3) - 0.7) * r.pores * 3.3 * (0.4 + 0.6 * f);
  if (r.flecks) dark += Math.max(0, noise(u, v, 128, 8, seed + 4) - 0.8) * r.flecks * 5;
  if (r.streaks) dark += Math.max(0, fbm(u, v, 2, r.streakCells, 2, seed + 5) - 0.5) * 2 * r.streaks;
  return Math.min(1, Math.max(MIN_VALUE, BASE_VALUE - dark * 0.2));
}

/**
 * Deterministic greyscale wood texture (values 0.78-1.0), tileable, sRGB, mipmapped.
 * `anisotropy` is applied when given (pass renderer.capabilities.getMaxAnisotropy()).
 */
export function createWoodTexture(grain, { size = 512, seed, anisotropy = 1 } = {}) {
  const recipe = RECIPES[grain];
  if (!recipe) throw new RangeError(`unknown wood grain: ${grain}`);
  const baseSeed = seed ?? grainSeed(grain);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.round(sample(recipe, x / size, y / size, baseSeed) * 255);
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `wood:${grain}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
