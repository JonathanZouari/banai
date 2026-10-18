// Procedural surface textures, drawn on a canvas at runtime: no image files, no network.
// A seeded PRNG keeps them identical on every load. They are greyscale near white, so the
// material colour (from the catalog) still decides the hue; the texture only adds grain.
// ASSUMPTION: visual approximations of the catalog materials, not material specifications.
import * as THREE from 'three';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function toTexture(element, { color, anisotropy }) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Long wood grain running along the texture's v axis (the panel's long side). */
function drawWood(element) {
  const context = element.getContext('2d');
  const { width, height } = element;
  const random = seeded(7);
  const image = context.createImageData(width, height);
  // Each column gets a tone from many thin, nearly straight stripes (quarter-cut veneer);
  // they drift sideways only slightly along v. Waves use whole periods so the texture tiles.
  const stripes = Array.from({ length: 70 }, () => ({
    x: random() * width,
    w: 0.6 + random() * 2.4,
    dark: 0.03 + random() * 0.08,
    wave: random() * Math.PI * 2,
    amp: 0.5 + random() * 1.5,
  }));
  const fibre = Array.from({ length: width }, () => (random() - 0.5) * 0.04);
  for (let y = 0; y < height; y += 1) {
    const phase = (y / height) * Math.PI * 2;
    for (let x = 0; x < width; x += 1) {
      let tone = 0.94 + fibre[x];
      for (const s of stripes) {
        const offset = x - s.x - Math.sin(phase * 2 + s.wave) * s.amp;
        const d = Math.min(Math.abs(offset), width - Math.abs(offset)); // tileable across u
        if (d < s.w) tone -= s.dark * (1 - d / s.w);
      }
      tone += (random() - 0.5) * 0.025; // fine pores
      const v = Math.round(Math.min(1, Math.max(0.75, tone)) * 255);
      const i = (y * width + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

/** Fine, low-contrast speckle used as a roughness map (melamine's slightly textured surface). */
function drawSpeckle(element) {
  const context = element.getContext('2d');
  const { width, height } = element;
  const random = seeded(11);
  const image = context.createImageData(width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.round((0.86 + random() * 0.14) * 255);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

/** Lazily created, shared textures. Returns nulls outside a browser (unit tests run in Node). */
export function createTextures({ anisotropy = 1 } = {}) {
  const available = typeof document !== 'undefined';
  let wood = null;
  let speckle = null;
  return {
    wood() {
      if (!available) return null;
      if (!wood) {
        const element = canvas(256, 1024);
        drawWood(element);
        wood = toTexture(element, { color: true, anisotropy });
      }
      return wood;
    },
    speckle() {
      if (!available) return null;
      if (!speckle) {
        const element = canvas(128, 128);
        drawSpeckle(element);
        speckle = toTexture(element, { color: false, anisotropy });
        speckle.repeat.set(4, 4);
      }
      return speckle;
    },
    dispose() {
      wood?.dispose();
      speckle?.dispose();
      wood = null;
      speckle = null;
    },
  };
}
