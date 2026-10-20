// Procedural wood grain (visual only). Built from a typed array (THREE.DataTexture), so it needs
// no canvas and the builders stay unit-testable in Node. Grain runs along the texture's V axis,
// i.e. vertically on doors and side panels.
import * as THREE from 'three';

// ASSUMPTION: prototype visual values, not a material specification.
const WIDTH = 256;
const HEIGHT = 512;

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in [0, 1]. */
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Near-white grain: the material colour (the catalog wood tone) tints it, so the swatch colour
// stays the average tone and one texture serves every wood colour.
const BASE = 236;

/** A neutral grain texture; multiply it by a material colour to get a wood tone. */
export function createWoodTexture() {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const nx = x / WIDTH;
      const ny = y / HEIGHT;
      // Long, slightly wavy fibres: stripes across U, distorted by low-frequency noise along V.
      const warp = noise(nx * 3, ny * 2.5) * 3.2 + noise(nx * 9, ny * 0.8) * 0.6;
      const rings = Math.sin((nx * 26 + warp) * Math.PI);
      const fibre = noise(nx * 120, ny * 6) - 0.5;
      const shade = 1 + rings * 0.07 + fibre * 0.09 + (noise(nx * 4, ny * 40) - 0.5) * 0.04;
      const i = (y * WIDTH + x) * 4;
      const value = Math.max(0, Math.min(255, Math.round(BASE * shade)));
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData = { wood: true };
  return texture;
}
