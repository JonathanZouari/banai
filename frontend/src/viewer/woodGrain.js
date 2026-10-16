// Procedural wood grain: a greyscale multiplier map (1 = the catalog colour as-is,
// darker values are grain lines), generated once per species and seeded by its id so
// every wood keeps its own pattern. Visual only, not a material specification.
import * as THREE from 'three';

const WIDTH = 256;
const HEIGHT = 1024;

function seedOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest distance between two coordinates on a wrapping (tiling) axis. */
const wrap = (delta, size) => Math.min(Math.abs(delta), size - Math.abs(delta));

/** Grain intensity (0..1, 1 = darkest line) for each pixel, as a Float32Array. */
export function grainField(id, width = WIDTH, height = HEIGHT) {
  const rand = random(seedOf(id));
  // Every wave uses a whole number of periods per tile, so the texture repeats seamlessly.
  const TAU = Math.PI * 2;
  // Slow sideways waves bend the grain as it runs along the board.
  const waves = Array.from({ length: 3 }, () => ({ freq: (TAU * (1 + Math.floor(rand() * 2))) / height, phase: rand() * TAU, amp: 3 + rand() * 7 }));
  const ringScale = (TAU * (5 + Math.floor(rand() * 5))) / width;
  const ringWobble = (TAU * 1) / width;
  const fibres = Float32Array.from({ length: width }, () => rand());
  const knots = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({ x: rand() * width, y: rand() * height, r: 10 + rand() * 18 }));

  const field = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    let warp = 0;
    waves.forEach(({ freq, phase, amp }) => { warp += amp * Math.sin(y * freq + phase); });
    for (let x = 0; x < width; x += 1) {
      let d = x + warp;
      knots.forEach((knot) => {
        const dx = wrap(x - knot.x, width);
        const dy = wrap(y - knot.y, height) * 0.35;
        const dist = Math.sqrt(dx * dx + dy * dy);
        d += (knot.r * knot.r * 3) / (dist + knot.r); // grain flows around knots
      });
      const ring = 0.5 + 0.5 * Math.sin(d * ringScale + 2.5 * Math.sin(d * ringWobble));
      const fibre = fibres[((Math.floor(d) % width) + width) % width];
      field[y * width + x] = Math.min(1, ring ** 6 * 0.75 + fibre * 0.25);
    }
  }
  return field;
}

/** A tiling CanvasTexture for a wood species, or null outside a browser. */
export function createWoodTexture(id) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(WIDTH, HEIGHT);
  const field = grainField(id);
  for (let i = 0; i < field.length; i += 1) {
    const value = Math.round(255 * (1 - 0.32 * field[i])); // grain darkens by up to 32%
    image.data.set([value, value, value, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; // a plain multiplier, not a colour
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
