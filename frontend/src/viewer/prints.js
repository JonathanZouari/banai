// Printed images on door fronts: a preview in the 3D view only. The image never leaves the
// browser: it is not part of the design, not saved, not sent to the server and not in the
// carpenter PDF (snapshot.js builds without prints). The store keeps only plain metadata
// ({ printId, name, width, height }); the pixels live here, outside the deep-frozen state.
import * as THREE from 'three';

export const PRINT_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_PRINT_BYTES = 10 * 1024 * 1024;
export const MAX_PRINT_SIDE = 2048;

export const PRINT_ERRORS = Object.freeze({
  type: 'Choose a PNG, JPEG or WebP image.',
  size: 'The image is larger than 10 MB.',
  decode: 'The image could not be read.',
});

export class PrintError extends Error {
  constructor(reason) {
    super(PRINT_ERRORS[reason]);
    this.name = 'PrintError';
    this.reason = reason;
  }
}

/**
 * UV repeat/offset that make an image "cover" a panel: fill it completely, keep the image's
 * proportions and crop what sticks out (centred). Aspects are width / height.
 */
export function coverTransform(imageAspect, panelAspect) {
  if (imageAspect > panelAspect) {
    const x = panelAspect / imageAspect;
    return { repeat: [x, 1], offset: [(1 - x) / 2, 0] };
  }
  const y = imageAspect / panelAspect;
  return { repeat: [1, y], offset: [0, (1 - y) / 2] };
}

/** Built-in sample prints, drawn in code (no external or copyrighted assets). */
export const SAMPLE_PRINTS = Object.freeze([
  { key: 'dunes', name: 'Dunes' },
  { key: 'forest', name: 'Forest' },
  { key: 'terrazzo', name: 'Terrazzo' },
]);

function drawSample(ctx, key, width, height) {
  if (key === 'dunes') {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#f6d7b8');
    sky.addColorStop(1, '#c9825b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    ['#b8693f', '#9c5233', '#7d3f27'].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 8) {
        ctx.lineTo(x, height * (0.55 + i * 0.13) + Math.sin(x / (90 + i * 40) + i) * height * 0.05);
      }
      ctx.lineTo(width, height);
      ctx.fill();
    });
  } else if (key === 'forest') {
    ctx.fillStyle = '#dfe8dc';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 26; i += 1) {
      const x = ((i * 137) % 100) / 100 * width;
      const h = height * (0.35 + ((i * 53) % 40) / 100);
      ctx.fillStyle = ['#2f5d3a', '#3e7a4b', '#55915d'][i % 3];
      ctx.beginPath();
      ctx.moveTo(x, height - h);
      ctx.lineTo(x - width * 0.07, height);
      ctx.lineTo(x + width * 0.07, height);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#f1ece4';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 160; i += 1) {
      ctx.fillStyle = ['#c97b5a', '#7a8c84', '#d9b38c', '#3d4a52'][i % 4];
      ctx.beginPath();
      ctx.ellipse(((i * 97) % 997) / 997 * width, ((i * 61) % 991) / 991 * height,
        6 + (i % 7) * 3, 4 + (i % 5) * 3, i, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

let nextId = 1;

export function createPrintRegistry({
  decode = (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  makeCanvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height }),
} = {}) {
  const entries = new Map(); // printId -> { canvas, texture }
  const add = (canvas, name) => {
    const printId = `print_${nextId++}`;
    entries.set(printId, { canvas, texture: null });
    return { printId, name, width: canvas.width, height: canvas.height };
  };

  return {
    /** Validate, decode and downscale a user's file. Resolves to metadata or throws PrintError. */
    async load(file) {
      if (!file || !PRINT_TYPES.includes(file.type)) throw new PrintError('type');
      if (file.size > MAX_PRINT_BYTES) throw new PrintError('size');
      let bitmap;
      try {
        bitmap = await decode(file);
      } catch {
        throw new PrintError('decode');
      }
      const scale = Math.min(1, MAX_PRINT_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return add(canvas, String(file.name || 'image').slice(0, 80));
    },
    sample(key) {
      const sample = SAMPLE_PRINTS.find((s) => s.key === key);
      if (!sample) throw new PrintError('decode');
      const canvas = makeCanvas(1024, 1536);
      drawSample(canvas.getContext('2d'), key, canvas.width, canvas.height);
      return add(canvas, sample.name);
    },
    has: (printId) => entries.has(printId),
    /** The shared texture for a print (created on first use). */
    texture(printId) {
      const entry = entries.get(printId);
      if (!entry) return null;
      if (!entry.texture) {
        entry.texture = new THREE.CanvasTexture(entry.canvas);
        entry.texture.colorSpace = THREE.SRGBColorSpace;
      }
      return entry.texture;
    },
    /** Free every print not in `inUse` (a Set of printIds). */
    releaseUnused(inUse) {
      for (const [printId, entry] of entries) {
        if (!inUse.has(printId)) {
          entry.texture?.dispose();
          entry.canvas.width = 0; // let the browser free the pixels now
          entries.delete(printId);
        }
      }
    },
    size: () => entries.size,
  };
}

/**
 * A front-face material for a printed door: the print, cropped to cover a panel of the given
 * size (mm), with the door finish's roughness. The texture is a clone (own repeat/offset).
 */
export function printMaterial(texture, panelWidth, panelHeight, base) {
  const map = texture.clone();
  const { repeat, offset } = coverTransform(texture.image.width / texture.image.height, panelWidth / panelHeight);
  map.repeat.set(...repeat);
  map.offset.set(...offset);
  map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map, roughness: base.roughness ?? 0.6, metalness: 0 });
  material.userData.print = true; // disposed with the wardrobe it belongs to
  return material;
}
