// Decorative room backdrops around the wardrobe (viewer only). They are NOT part of the
// design, cannot be selected or edited, and never reach saves, the AI or the PDF.
// ASSUMPTION: visual-only prototype values (room colours, furniture sizes), not room design.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toM } from './units.js';

const ROOM_WIDTH = 12;
const ROOM_DEPTH = 8;
const WALL_HEIGHT = 6;

const material = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });

const shaded = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/** A soft-edged box (furniture, cushions). `look` is a colour or a material; `r` the corner radius in metres. */
const soft = (w, h, d, look, x, y, z, r = 0.02) => {
  const radius = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const mat = typeof look === 'string' ? material(look) : look;
  const mesh = shaded(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat));
  mesh.position.set(x, y, z);
  return mesh;
};

const flat = (geometry, mat, x, y, z) => {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
};

/** Deterministic pseudo-random numbers, so a room always looks the same. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * A procedural surface texture: `draw(ctx, size, random)` paints over the base colour. Returns a
 * plain-colour material where there is no DOM (unit tests).
 */
function painted(hex, roughness, size, repeat, draw) {
  const mat = material(hex, roughness);
  if (typeof document === 'undefined') return mat;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size, seeded(parseInt(hex.slice(1), 16)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  mat.map = texture;
  mat.color.set('#ffffff');
  return mat;
}

/** Oak boards: per-board tone, flowing grain lines, seams and staggered joints. */
const floorMaterial = (hex) => painted(hex, 0.7, 1024, [ROOM_WIDTH / 4.8, ROOM_DEPTH / 2.4], (ctx, size, random) => {
  const boards = 8;
  const h = size / boards;
  for (let i = 0; i < boards; i += 1) {
    const y = i * h;
    ctx.fillStyle = random() < 0.5 ? `rgba(255, 244, 225, ${0.04 + random() * 0.08})` : `rgba(80, 50, 25, ${0.04 + random() * 0.08})`;
    ctx.fillRect(0, y, size, h);
    for (let g = 0; g < 14; g += 1) {
      const gy = y + random() * h;
      ctx.strokeStyle = random() < 0.65 ? `rgba(70, 42, 18, ${0.06 + random() * 0.12})` : `rgba(255, 238, 210, ${0.05 + random() * 0.08})`;
      ctx.lineWidth = 0.5 + random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      const sway = 1 + random() * 4;
      const phase = random() * Math.PI * 2;
      for (let x = 0; x <= size; x += 24) ctx.lineTo(x, gy + Math.sin(x / 90 + phase) * sway);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(50, 32, 15, 0.35)';
    ctx.fillRect(0, y, size, 2);
    ctx.fillRect((i * 389 + 150) % size, y, 2, h);
  }
});

/** Matte plaster: fine, low-contrast speckle. */
const wallMaterial = (hex) => painted(hex, 0.95, 256, [ROOM_WIDTH / 1.5, 6 / 1.5], (ctx, size, random) => {
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(0, 0, 0, 0.035)' : 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
});

/** Woven fabric (bedding, rugs): a fine warp and weft. */
const fabric = (hex, scale = 6) => painted(hex, 1, 128, [scale, scale], (ctx, size, random) => {
  for (let i = 0; i < size; i += 2) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + random() * 0.04})`;
    ctx.fillRect(0, i, size, 1);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + random() * 0.04})`;
    ctx.fillRect(i, 0, 1, size);
  }
});

/**
 * A soft contact shadow that follows the footprint of what stands on the floor: a rectangle of
 * `w` × `d` (a disc when `round`), dark under the item and fading out `spread` metres past its edges.
 */
function contactShadow(cx, cz, w, d, strength = 0.42, { round = false, spread = 0.07 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: strength, depthWrite: false });
  const fullW = w + spread * 2;
  const fullD = d + spread * 2;
  if (typeof document !== 'undefined') {
    const px = 256;
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    // The item's footprint, blurred by about the spread so the edge fades softly.
    const insetX = (spread / fullW) * px;
    const insetY = (spread / fullD) * px;
    ctx.filter = `blur(${Math.max(2, Math.min(insetX, insetY) * 0.6)}px)`;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (round) ctx.ellipse(px / 2, px / 2, px / 2 - insetX, px / 2 - insetY, 0, 0, Math.PI * 2);
    else ctx.rect(insetX, insetY, px - insetX * 2, px - insetY * 2);
    ctx.fill();
    mat.alphaMap = new THREE.CanvasTexture(canvas);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(fullW, fullD), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, 0.002, cz);
  mesh.renderOrder = 1;
  return mesh;
}

/** Wood (furniture): long, gently waving grain, low contrast so painted and dark woods stay calm. */
const wood = (hex) => painted(hex, 0.6, 256, [1, 1], (ctx, size, random) => {
  for (let i = 0; i < 40; i += 1) {
    const y = random() * size;
    ctx.strokeStyle = random() < 0.6 ? `rgba(60, 35, 15, ${0.05 + random() * 0.1})` : `rgba(255, 240, 215, ${0.04 + random() * 0.07})`;
    ctx.lineWidth = 0.6 + random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const sway = 2 + random() * 6;
    const phase = random() * Math.PI * 2;
    for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x / 70 + phase) * sway);
    ctx.stroke();
  }
});

// Furniture. `x` is the left edge, `back` the wall plane (z); sizes in metres.
const singleBed = (x, back, c) => {
  const cx = x + 0.95;
  const cz = back + 0.47;
  return [
    soft(1.94, 0.26, 0.94, wood(c.frame), cx, 0.17, cz, 0.03),
    soft(1.88, 0.18, 0.88, fabric('#fbfaf7'), cx, 0.39, cz, 0.06),
    soft(1.32, 0.06, 0.96, fabric(c.blanket), cx + 0.28, 0.49, cz, 0.03),
    soft(0.5, 0.12, 0.34, fabric(c.pillow, 3), cx - 0.62, 0.53, cz, 0.05),
    soft(0.05, 0.85, 0.94, wood(c.frame), cx - 0.97, 0.43, cz, 0.02),
    contactShadow(cx, cz, 1.94, 0.94),
  ];
};

// Headboard against the wall, 160 × 200 cm. `low` gives a platform bed.
const doubleBed = (x, back, c, low = false) => {
  const cx = x + 0.82;
  const cz = back + 1.06;
  const base = low ? 0.16 : 0.3;
  return [
    soft(1.64, base, 2.04, wood(c.frame), cx, base / 2, cz, 0.03),
    soft(1.58, 0.2, 1.98, fabric('#fbfaf7'), cx, base + 0.1, cz, 0.07),
    soft(1.68, 0.06, 1.32, fabric(c.blanket), cx, base + 0.22, cz + 0.36, 0.03),
    soft(0.62, 0.14, 0.36, fabric(c.pillow, 3), cx - 0.38, base + 0.26, back + 0.3, 0.06),
    soft(0.62, 0.14, 0.36, fabric(c.pillow, 3), cx + 0.38, base + 0.26, back + 0.3, 0.06),
    contactShadow(cx, cz, 1.64, 2.04),
    ...(low ? [] : [soft(1.7, 1.05, 0.08, wood(c.frame), cx, 0.53, back + 0.04, 0.03)]),
  ];
};

const nightstand = (x, back, color) => {
  const cx = x + 0.23;
  const cz = back + 0.21;
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.18, 32, 1, true), new THREE.MeshStandardMaterial({
    color: '#f7efe1', roughness: 0.9, emissive: '#ffcf8a', emissiveIntensity: 0.9, side: THREE.DoubleSide,
  }));
  shade.position.set(cx, 0.86, cz);
  // A small warm glow from the lit lamp onto the wall and the nightstand.
  const glow = new THREE.PointLight('#ffc477', 0.9, 1.8, 2);
  glow.position.set(cx, 0.86, cz + 0.05);
  return [
    glow,
    soft(0.46, 0.5, 0.42, wood(color), cx, 0.25, cz, 0.02),
    contactShadow(cx, cz, 0.46, 0.42),
    soft(0.04, 0.24, 0.04, '#b9a68a', cx, 0.62, cz, 0.01),
    shaded(shade),
  ];
};

const plant = (x, z) => {
  const pot = shaded(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.34, 32), material('#d9cbb8', 0.6)));
  pot.position.set(x, 0.17, z);
  const leaves = [[0, 0.62, 0, 0.24], [0.13, 0.78, 0.04, 0.17], [-0.12, 0.8, -0.03, 0.18], [0.02, 0.95, 0.02, 0.15]]
    .map(([dx, y, dz, r]) => {
      const leaf = shaded(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), material('#5d8a55', 0.9)));
      leaf.position.set(x + dx, y, z + dz);
      return leaf;
    });
  return [pot, ...leaves, contactShadow(x, z, 0.32, 0.32, 0.4, { round: true, spread: 0.05 })];
};

// A framed picture on the wall: frame, passe-partout and a two-tone print.
const picture = (cx, cy, back, w, h, colors) => [
  soft(w, h, 0.03, '#2f2a25', cx, cy, back + 0.015, 0.005),
  soft(w - 0.05, h - 0.05, 0.032, '#f6f3ee', cx, cy, back + 0.016, 0.002),
  soft((w - 0.16) / 2, h - 0.16, 0.034, colors[0], cx - (w - 0.16) / 4, cy, back + 0.017, 0.002),
  soft((w - 0.16) / 2, h - 0.16, 0.034, colors[1], cx + (w - 0.16) / 4, cy, back + 0.017, 0.002),
];

const desk = (x, back, c) => {
  const cx = x + 0.62;
  const cz = back + 0.32;
  const legs = [[-0.57, -0.27], [0.57, -0.27], [-0.57, 0.27], [0.57, 0.27]]
    .map(([dx, dz]) => soft(0.04, 0.72, 0.04, c.frame, cx + dx, 0.36, cz + dz, 0.01));
  return [
    soft(1.24, 0.035, 0.62, wood(c.top), cx, 0.74, cz, 0.01),
    ...legs,
    soft(0.46, 0.05, 0.44, c.accent, cx, 0.46, cz + 0.55, 0.02),
    soft(0.46, 0.42, 0.04, c.accent, cx, 0.7, cz + 0.76, 0.02),
    soft(0.04, 0.44, 0.04, c.frame, cx, 0.22, cz + 0.55, 0.01),
    soft(0.3, 0.2, 0.02, '#2b2d30', cx + 0.25, 0.86, cz - 0.12, 0.005),
    contactShadow(cx, cz, 1.24, 0.62, 0.18, { spread: 0.1 }),
  ];
};

// A front door with frame and handle, a bench and a doormat.
const entrance = (x, back, c) => [
  soft(1.07, 2.17, 0.05, '#f4f1ea', x + 0.6, 1.085, back + 0.025, 0.01),
  soft(0.95, 2.1, 0.06, c.door, x + 0.6, 1.05, back + 0.035, 0.01),
  soft(0.14, 0.025, 0.05, '#b8b8b8', x + 0.98, 1.0, back + 0.08, 0.008),
  soft(1.0, 0.06, 0.36, wood(c.frame), x + 1.95, 0.44, back + 0.18, 0.02),
  soft(0.05, 0.41, 0.32, c.frame, x + 1.5, 0.205, back + 0.18, 0.01),
  soft(0.05, 0.41, 0.32, c.frame, x + 2.4, 0.205, back + 0.18, 0.01),
  soft(0.9, 0.012, 0.55, fabric(c.rug, 4), x + 0.6, 0.006, back + 0.5, 0.004),
  contactShadow(x + 1.95, back + 0.18, 1.0, 0.36, 0.2, { spread: 0.08 }),
];

const ROOMS = Object.freeze({
  bedroom: {
    wall: '#ece6dc', floor: '#c8a57c', rug: '#cbbba6',
    furniture: (x, back) => [
      ...nightstand(x, back, '#8a6a4c'),
      ...doubleBed(x + 0.55, back, { frame: '#8a6a4c', blanket: '#9fb3a1', pillow: '#f3efe7' }),
      ...picture(x + 1.37, 1.65, back, 0.9, 0.6, ['#c7b299', '#8fa596']),
    ],
  },
  kids_room: {
    wall: '#d5e6f0', floor: '#dcc29c', rug: '#f2c14e',
    furniture: (x, back) => [
      ...singleBed(x, back, { frame: '#f4f1ea', blanket: '#7fb7d9', pillow: '#f6d6de' }),
      soft(0.5, 0.4, 0.4, '#e5735c', x + 1.5, 0.2, back + 1.35, 0.04),
      contactShadow(x + 1.5, back + 1.35, 0.5, 0.4),
      ...picture(x + 0.95, 1.5, back, 0.6, 0.5, ['#f2c14e', '#7fb7d9']),
    ],
  },
  master_bedroom: {
    wall: '#e6dee6', floor: '#b8946b', rug: '#d8cfc4',
    furniture: (x, back) => [
      ...nightstand(x, back, '#5e4a3c'),
      ...doubleBed(x + 0.55, back, { frame: '#5e4a3c', blanket: '#8a7fa0', pillow: '#f5f2ee' }),
      ...nightstand(x + 2.29, back, '#5e4a3c'),
      ...picture(x + 1.37, 1.65, back, 1.0, 0.6, ['#b7a8c4', '#e0d2c0']),
    ],
  },
  minimal_room: {
    wall: '#f2f1ed', floor: '#d9d4cb', rug: null,
    furniture: (x, back) => [
      ...doubleBed(x, back, { frame: '#3b3d40', blanket: '#e6e3dc', pillow: '#ffffff' }, true),
      ...plant(x + 2.05, back + 0.32),
      ...picture(x + 0.82, 1.3, back, 0.7, 0.9, ['#d6d2ca', '#3b3d40']),
    ],
  },
  entrance: {
    wall: '#ebe4d6', floor: '#b9b2a8', rug: null,
    furniture: (x, back) => entrance(x, back, { door: '#6b4a32', frame: '#c49a6c', rug: '#5a5048' }),
  },
  study: {
    wall: '#e0e7dd', floor: '#c49a6c', rug: '#a8b8a0',
    furniture: (x, back) => [
      ...desk(x, back, { top: '#c49a6c', frame: '#3b3d40', accent: '#3b3d40' }),
      ...plant(x + 1.65, back + 0.32),
      ...picture(x + 0.62, 1.55, back, 0.8, 0.55, ['#a8b8a0', '#e4d6c0']),
    ],
  },
});

export const BACKDROPS = Object.freeze(Object.keys(ROOMS));

/** Build the decorative room `kind` around the design's wardrobe, or null when there is none. */
export function buildBackdrop(kind, design) {
  const room = Object.hasOwn(ROOMS, kind ?? '') ? ROOMS[kind] : null;
  if (!room) return null;
  const width = toM(design.dimensions.width);
  const back = -toM(design.dimensions.depth) - 0.01;
  const centre = width / 2 + 1;
  const group = new THREE.Group();
  const floor = flat(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMaterial(room.floor), centre, -0.001, back + ROOM_DEPTH / 2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, WALL_HEIGHT), wallMaterial(room.wall));
  wall.position.set(centre, WALL_HEIGHT / 2, back);
  wall.receiveShadow = true;
  const skirting = soft(ROOM_WIDTH, 0.08, 0.015, '#f7f5f0', centre, 0.04, back + 0.008, 0.004);
  const wardrobeShadow = contactShadow(width / 2, back / 2, width, -back, 0.45);
  group.add(floor, wall, skirting, wardrobeShadow, ...room.furniture(width + 0.35, back));
  if (room.rug) {
    const rug = flat(new THREE.CircleGeometry(0.8, 64), fabric(room.rug, 8), width / 2 + 0.6, 0.003, 1.1);
    group.add(rug);
  }
  return group;
}

export function disposeBackdrop(group) {
  group.traverse((object) => {
    if (object.isLight) object.dispose();
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.map?.dispose();
      object.material.alphaMap?.dispose();
      object.material.dispose();
    }
  });
}
