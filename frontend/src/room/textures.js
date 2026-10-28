// Procedural textures for the room, drawn on small canvases (no image files, nothing to license):
// floors, the view through the window and a soft shadow. Without a DOM (unit tests) they are null
// and the materials simply have no map.
import * as THREE from 'three';

const hasCanvas = () => typeof document !== 'undefined';

function canvasTexture(width, height, draw, { repeat = false } = {}) {
  if (!hasCanvas()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Deterministic pseudo-random numbers, so a room looks the same every time. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// One texture tile is this many metres of floor.
export const FLOOR_TILE_M = Object.freeze({ wood: 1.6, tiles: 1.2, carpet: 1 });

/** Wood planks, large stone-look tiles or a soft carpet, at 256 px per tile. */
export function floorTexture(kind, base) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const random = seeded(kind.length * 97 + parseInt(base.slice(1), 16));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    if (kind === 'wood') {
      for (let row = 0; row < 8; row += 1) {
        ctx.fillStyle = `rgba(${random() < 0.5 ? '255,240,220' : '70,40,15'}, ${0.04 + random() * 0.07})`;
        ctx.fillRect(0, row * 32, w, 32);
        ctx.fillStyle = 'rgba(70, 40, 15, 0.28)';
        ctx.fillRect(0, row * 32, w, 1);
        ctx.fillRect(Math.round(random() * w), row * 32, 1, 32); // plank end
        for (let g = 0; g < 5; g += 1) {
          ctx.fillStyle = `rgba(70, 40, 15, ${0.05 + random() * 0.06})`;
          ctx.fillRect(0, row * 32 + 4 + random() * 24, w, 1);
        }
      }
    } else if (kind === 'tiles') {
      for (let i = 0; i < 2; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          ctx.fillStyle = `rgba(0, 0, 0, ${0.015 + random() * 0.03})`;
          ctx.fillRect(i * 128, j * 128, 128, 128);
        }
      }
      ctx.fillStyle = 'rgba(80, 70, 60, 0.35)';
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, 128, w, 2);
      ctx.fillRect(0, 0, 2, h);
      ctx.fillRect(128, 0, 2, h);
    } else {
      for (let i = 0; i < 2200; i += 1) {
        ctx.fillStyle = `rgba(${random() < 0.5 ? '255,255,255' : '0,0,0'}, ${0.03 + random() * 0.05})`;
        ctx.fillRect(random() * w, random() * h, 2, 2);
      }
    }
  }, { repeat: true });
}

/** A green, inviting landscape: sky, sun, clouds, rolling hills and trees. Morning or evening. */
export function viewTexture(evening) {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const random = seeded(evening ? 7 : 3);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, evening ? '#4a5888' : '#7fbbe8');
    sky.addColorStop(0.7, evening ? '#e79a6c' : '#cfe7f7');
    sky.addColorStop(1, evening ? '#f6c48c' : '#eef6fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const sun = evening ? [w * 0.28, h * 0.55, 40] : [w * 0.74, h * 0.16, 30];
    const glow = ctx.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], sun[2] * 4);
    glow.addColorStop(0, evening ? 'rgba(255,220,160,0.9)' : 'rgba(255,253,235,1)');
    glow.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    if (!evening) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      for (let c = 0; c < 4; c += 1) {
        const cx = random() * w;
        const cy = h * (0.1 + random() * 0.2);
        for (let k = 0; k < 6; k += 1) {
          ctx.beginPath();
          ctx.ellipse(cx + k * 22, cy + Math.sin(k) * 6, 30, 16, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const hill = (base, amp, wave, phase, top, bottom) => {
      const fill = ctx.createLinearGradient(0, base - amp, 0, h);
      fill.addColorStop(0, top);
      fill.addColorStop(1, bottom);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, base + Math.sin(x / wave + phase) * amp + Math.sin(x / (wave * 0.37) + phase) * amp * 0.3);
      ctx.lineTo(w, h);
      ctx.fill();
    };
    hill(h * 0.6, 22, 150, 1.3, evening ? '#6f8a6a' : '#a9d39a', evening ? '#506a4f' : '#84bb73');
    hill(h * 0.7, 26, 110, 3.1, evening ? '#55704f' : '#86c070', evening ? '#3f593c' : '#5f9d50');
    // Trees: soft rounded crowns in clusters.
    for (let t = 0; t < 14; t += 1) {
      const x = random() * w;
      const y = h * (0.66 + random() * 0.12);
      const r = 10 + random() * 14;
      ctx.fillStyle = evening ? '#33482f' : '#3f7a3a';
      ctx.fillRect(x - 1.5, y, 3, r * 0.9);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = evening ? 'rgba(255,200,140,0.18)' : 'rgba(255,255,220,0.22)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.4, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    hill(h * 0.84, 14, 90, 5.2, evening ? '#40593b' : '#6aa95a', evening ? '#2e4430' : '#4c8a41');
  });
}

/** A soft-edged dark rectangle (alpha in the colour's darkness), for contact shadows. */
export function softShadowTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A soft white glow (alpha falls off from the centre), for light pools and the sun patch. */
export function softGlowTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}
