// Decorative "empty room" around the wardrobe: floor, back wall and one side wall with
// skirting, plus a soft contact shadow. Visual staging only. It is NOT room design and
// NOT part of the canonical design: nothing here is pickable or saved with the design.
// The customer can restyle it (wall colour, floor type); that is a viewer preference.
// Walls are single-sided, so they turn see-through when the camera orbits behind them.
import * as THREE from 'three';
import { toM } from './units.js';

// ASSUMPTION: visual-only staging values (metres), not product data.
const ROOM = Object.freeze({
  minWidth: 7, sideMargin: 2.2, depth: 8, minHeight: 2.8, headroom: 0.45,
  wallGap: 0.004, skirting: { height: 0.08, depth: 0.012 },
});

export const WALL_COLORS = Object.freeze([
  { id: 'warm_white', name: 'Warm white', hex: '#efe9e1' },
  { id: 'linen', name: 'Linen', hex: '#e6dccd' },
  { id: 'greige', name: 'Greige', hex: '#d6cfc4' },
  { id: 'sage', name: 'Sage', hex: '#c6d0bd' },
  { id: 'dusty_blue', name: 'Dusty blue', hex: '#c5d0da' },
  { id: 'clay', name: 'Clay', hex: '#dcbfaa' },
]);

export const FLOOR_TYPES = Object.freeze([
  { id: 'oak', name: 'Light oak', swatch: '#cdb79a' },
  { id: 'walnut', name: 'Walnut', swatch: '#7a5a42' },
  { id: 'concrete', name: 'Concrete', swatch: '#b9b6b1' },
  { id: 'tiles', name: 'Stone tiles', swatch: '#e2ddd4' },
  { id: 'carpet', name: 'Carpet', swatch: '#cfc4b3' },
]);

export const DEFAULT_ROOM = Object.freeze({ wall: WALL_COLORS[0].hex, floor: 'oak' });
export const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export const isFloorType = (value) => FLOOR_TYPES.some((type) => type.id === value);

/** Deterministic pseudo-random numbers, so textures look the same on every load. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function canvas2d(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function planks(ctx, size, tones, joint) {
  const rows = 8;
  const rowH = size / rows;
  const plank = size / 2;
  for (let r = 0; r < rows; r += 1) {
    const offset = (r * 197) % plank; // staggered plank ends, always < one plank
    for (let k = -1; k * plank + offset < size; k += 1) {
      const x = offset + k * plank;
      ctx.fillStyle = tones[(r * 3 + k + 5) % tones.length];
      ctx.fillRect(x, r * rowH, plank, rowH);
      ctx.fillStyle = joint;
      ctx.fillRect(x, r * rowH, 2, rowH); // end joint
    }
    ctx.fillStyle = joint;
    ctx.fillRect(0, r * rowH, size, 2); // long joint
  }
}

function speckle(ctx, size, rand, colors, count, maxR) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 0.4 + rand() * maxR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Procedural floor texture for a floor type: { canvas, tileMetres }. */
function drawFloor(type) {
  const size = 512;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(42);
  switch (type) {
    case 'walnut':
      planks(ctx, size, ['#7a5a42', '#71523b', '#80604a', '#6b4d38', '#785840'], 'rgba(30, 18, 10, 0.35)');
      return { canvas, tileMetres: 1.4 };
    case 'concrete':
      ctx.fillStyle = '#b9b6b1';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, ['rgba(255,255,255,0.10)', 'rgba(60,55,50,0.08)'], 2600, 1.4);
      return { canvas, tileMetres: 2.4 };
    case 'tiles': {
      ctx.fillStyle = '#cfc8bd';
      ctx.fillRect(0, 0, size, size);
      const n = 4;
      const tile = size / n;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          ctx.fillStyle = ['#e4dfd6', '#e0dad0', '#e7e2da'][(i + 2 * j) % 3];
          ctx.fillRect(i * tile + 2, j * tile + 2, tile - 4, tile - 4);
        }
      }
      return { canvas, tileMetres: 2.4 };
    }
    case 'carpet':
      ctx.fillStyle = '#cfc4b3';
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, rand, ['rgba(255,255,255,0.12)', 'rgba(90,75,55,0.10)'], 6000, 0.9);
      return { canvas, tileMetres: 1.2 };
    default: // light oak
      planks(ctx, size, ['#cdb79a', '#c9b294', '#d2bda1', '#c6ae8f', '#d0ba9d'], 'rgba(90, 64, 40, 0.18)');
      return { canvas, tileMetres: 1.6 };
  }
}

/** Soft radial shadow texture for under the wardrobe. */
function shadowTexture() {
  const { canvas, ctx } = canvas2d(128);
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(40, 30, 20, 0.38)');
  gradient.addColorStop(0.6, 'rgba(40, 30, 20, 0.14)');
  gradient.addColorStop(1, 'rgba(40, 30, 20, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createRoom(scene) {
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);
  const shadowMap = shadowTexture();
  let floorMap = null;
  let tileMetres = 1.6;
  let size = null;
  const materials = {
    floor: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ color: DEFAULT_ROOM.wall, roughness: 0.95 }),
    sideWall: new THREE.MeshStandardMaterial({ color: DEFAULT_ROOM.wall, roughness: 0.95 }),
    skirting: new THREE.MeshStandardMaterial({ color: '#f6f2ec', roughness: 0.7 }),
    shadow: new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
  };
  let style = { wall: null, floor: null };

  const clear = () => {
    group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
    });
    group.clear();
  };

  const plane = (w, h, material) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);

  const repeatFloor = () => {
    if (floorMap && size) floorMap.repeat.set(size.roomW / tileMetres, ROOM.depth / tileMetres);
  };

  const room = {
    /** (Re)build the room around a wardrobe of the given dimensions (mm). */
    update({ width, height, depth }) {
      clear();
      const w = toM(width);
      const d = toM(depth);
      const roomW = Math.max(ROOM.minWidth, w + 2 * ROOM.sideMargin);
      const roomH = Math.max(ROOM.minHeight, toM(height) + ROOM.headroom);
      size = { roomW };
      const left = w / 2 - roomW / 2;
      const backZ = -d - ROOM.wallGap; // the wardrobe stands against the back wall
      const midZ = backZ + ROOM.depth / 2;

      const floor = plane(roomW, ROOM.depth, materials.floor);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(w / 2, 0, midZ);
      repeatFloor();

      const back = plane(roomW, roomH, materials.wall);
      back.position.set(w / 2, roomH / 2, backZ);

      const side = plane(ROOM.depth, roomH, materials.sideWall);
      side.rotation.y = Math.PI / 2; // faces +x (into the room)
      side.position.set(left, roomH / 2, midZ);

      const { height: sh, depth: sd } = ROOM.skirting;
      const backSkirting = new THREE.Mesh(new THREE.BoxGeometry(roomW, sh, sd), materials.skirting);
      backSkirting.position.set(w / 2, sh / 2, backZ + sd / 2);
      const sideSkirting = new THREE.Mesh(new THREE.BoxGeometry(sd, sh, ROOM.depth), materials.skirting);
      sideSkirting.position.set(left + sd / 2, sh / 2, midZ);

      const shadow = plane(w * 1.25 + 0.3, d * 1.6 + 0.3, materials.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(w / 2, 0.002, -d / 2);
      shadow.renderOrder = -1;

      group.add(floor, back, side, backSkirting, sideSkirting, shadow);
    },

    /** Restyle walls and floor. Invalid values fall back to the defaults. */
    setStyle({ wall, floor } = {}) {
      const wallHex = isHex(wall) ? wall : DEFAULT_ROOM.wall;
      const floorType = isFloorType(floor) ? floor : DEFAULT_ROOM.floor;
      if (wallHex !== style.wall) {
        materials.wall.color.set(wallHex);
        materials.sideWall.color.set(wallHex).multiplyScalar(0.96); // a touch of shading
      }
      if (floorType !== style.floor) {
        const drawn = drawFloor(floorType);
        floorMap?.dispose();
        floorMap = new THREE.CanvasTexture(drawn.canvas);
        floorMap.wrapS = THREE.RepeatWrapping;
        floorMap.wrapT = THREE.RepeatWrapping;
        floorMap.colorSpace = THREE.SRGBColorSpace;
        floorMap.anisotropy = 4;
        tileMetres = drawn.tileMetres;
        materials.floor.map = floorMap;
        materials.floor.needsUpdate = true;
        repeatFloor();
      }
      style = { wall: wallHex, floor: floorType };
    },

    setVisible(visible) {
      group.visible = visible;
    },

    dispose() {
      clear();
      floorMap?.dispose();
      shadowMap.dispose();
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
  room.setStyle(DEFAULT_ROOM);
  return room;
}
