// A procedural wood grain, shared by the live viewer and the PDF snapshot (visual prototype only).
import * as THREE from 'three';

/** Deterministic pseudo-random numbers, so the same design always gives the same picture. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A procedural vertical grain on the base colour (canvas texture). */
export function woodTexture(hex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const random = seeded(parseInt(hex.slice(1), 16));
  for (let i = 0; i < 70; i += 1) {
    const x = random() * canvas.width;
    const dark = random() < 0.6;
    ctx.strokeStyle = dark ? `rgba(60, 35, 15, ${0.08 + random() * 0.16})` : `rgba(255, 240, 215, ${0.04 + random() * 0.08})`;
    ctx.lineWidth = 0.6 + random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    const sway = 3 + random() * 10;
    const phase = random() * Math.PI * 2;
    for (let y = 0; y <= canvas.height; y += 16) {
      ctx.lineTo(x + Math.sin(y / 140 + phase) * sway, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
