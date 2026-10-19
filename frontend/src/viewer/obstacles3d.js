// Wall obstacles in 3D, at their measured size (design.site.obstacles): the wall the wardrobe stands against,
// and on it a model per type. A socket or a switch is a wall plate, an air conditioner a wall unit with its
// vent, a pipe a pipe along its longer side, a window a frame with glass and a sill, a panel a skirting board,
// and anything else ("other": a radiator, a column) a plain box at its size, named by its label in room.js.
// x is measured from the wardrobe's left face and y from the floor (docs/schema.md "Site"); the wall's face
// is the plane of the carcass back (z = -depth). An obstacle behind the carcass is hidden by it, so the overlay
// (room.js) also shows it over the doors, x-ray style. Visual only: never picked, hidden in renders and video.
import * as THREE from 'three';
import { toM } from './units.js';

export const OBSTACLE_DEPTH = Object.freeze({ socket: 10, switch: 10, ac: 220, pipe: null, window: 60, panel: 15, other: 100 });
const WALL_MARGIN = 1200; // mm of wall beyond the wardrobe and the obstacles, each side

const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(toM(w), toM(h), toM(d)), material);

function materialsFor() {
  return {
    wall: new THREE.MeshStandardMaterial({ color: '#f7f2ea', roughness: 0.95 }),
    plate: new THREE.MeshStandardMaterial({ color: '#fbfbf9', roughness: 0.45 }),
    hole: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.8 }),
    rocker: new THREE.MeshStandardMaterial({ color: '#ececea', roughness: 0.35 }),
    unit: new THREE.MeshStandardMaterial({ color: '#f4f5f5', roughness: 0.4 }),
    vent: new THREE.MeshStandardMaterial({ color: '#9aa0a4', roughness: 0.6 }),
    pipe: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.35, metalness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: '#f2f0ec', roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#bcd6e8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }),
    panel: new THREE.MeshStandardMaterial({ color: '#e6ddcf', roughness: 0.7 }),
    other: new THREE.MeshStandardMaterial({ color: '#d9cdbd', roughness: 0.6 }),
    edge: new THREE.LineBasicMaterial({ color: '#8a7a68' }),
  };
}

/** One obstacle's parts, centred on its own rectangle (x, y in mm on the wall plane; z out of the wall). */
export function obstacleParts({ type, width: w, height: h }, m) {
  const parts = [];
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(toM(x), toM(y), toM(z));
    parts.push(mesh);
  };
  if (type === 'socket') {
    add(box(w, h, 10, m.plate), 0, 0, 5);
    const r = Math.max(2, Math.min(w, h) * 0.06);
    [-1, 1].forEach((side) => {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(toM(r), toM(r), toM(2), 16), m.hole);
      hole.rotation.x = Math.PI / 2;
      add(hole, side * w * 0.17, 0, 10.5);
    });
  } else if (type === 'switch') {
    add(box(w, h, 10, m.plate), 0, 0, 5);
    add(box(w * 0.45, h * 0.6, 6, m.rocker), 0, 0, 12);
  } else if (type === 'ac') {
    const d = OBSTACLE_DEPTH.ac;
    add(box(w, h, d, m.unit), 0, 0, d / 2);
    add(box(w * 0.86, Math.max(6, h * 0.06), 4, m.vent), 0, -h * 0.32, d + 1); // the air outlet along the bottom
  } else if (type === 'pipe') {
    const along = w >= h; // a pipe runs along its longer side; the shorter one is its diameter
    const length = along ? w : h;
    const radius = Math.max(4, (along ? h : w) / 2);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(toM(radius), toM(radius), toM(length), 24), m.pipe);
    if (along) pipe.rotation.z = Math.PI / 2;
    add(pipe, 0, 0, radius);
  } else if (type === 'window') {
    const f = Math.min(60, Math.min(w, h) * 0.12);
    add(box(w, f, 60, m.frame), 0, h / 2 - f / 2, 30);
    add(box(w, f, 60, m.frame), 0, -h / 2 + f / 2, 30);
    add(box(f, h - 2 * f, 60, m.frame), -w / 2 + f / 2, 0, 30);
    add(box(f, h - 2 * f, 60, m.frame), w / 2 - f / 2, 0, 30);
    add(box(w - 2 * f, h - 2 * f, 6, m.glass), 0, 0, 20);
    add(box(w + 80, 25, 120, m.frame), 0, -h / 2 - 12, 60); // the sill
  } else if (type === 'panel') {
    add(box(w, h, OBSTACLE_DEPTH.panel, m.panel), 0, 0, OBSTACLE_DEPTH.panel / 2);
  } else if (type === 'other') {
    // Its depth is unknown: a 10 cm box (thinner than that when it is small), with its edges drawn.
    const d = Math.min(OBSTACLE_DEPTH.other, Math.max(20, Math.min(w, h)));
    const body = box(w, h, d, m.other);
    body.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), m.edge));
    add(body, 0, 0, d / 2);
  }
  parts.forEach((part) => {
    part.castShadow = type !== 'window';
    part.receiveShadow = true;
    part.traverse((node) => {
      node.raycast = () => {}; // never picked
    });
  });
  return parts;
}

/** The wall's extent (mm): around the wardrobe and every obstacle, from the floor to above the highest. */
export function wallExtent(design, obstacles) {
  const { width, height } = design.dimensions;
  const xs = [0, width, ...obstacles.flatMap((o) => [o.x, o.x + o.width])];
  const top = Math.max(height + 400, design.site?.ceiling ?? 0, ...obstacles.map((o) => o.y + o.height + 300));
  return { x0: Math.min(...xs) - WALL_MARGIN, x1: Math.max(...xs) + WALL_MARGIN, top };
}

/**
 * The wall and the obstacles as one group, or null without obstacles. `wall: false` leaves the wall out (the room
 * plan builds it). dispose() frees its geometry and materials.
 */
export function buildObstacles(design, depth, { wall: withWall = true } = {}) {
  const obstacles = (design.site?.obstacles ?? []).filter((o) => Object.hasOwn(OBSTACLE_DEPTH, o.type));
  if (!obstacles.length) return null;
  const m = materialsFor();
  const group = new THREE.Group();
  group.name = 'obstacles';
  if (withWall) {
    const { x0, x1, top } = wallExtent(design, obstacles);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(toM(x1 - x0), toM(top)), m.wall);
    wall.position.set(toM((x0 + x1) / 2), toM(top / 2), toM(-depth - 1));
    wall.receiveShadow = true;
    wall.raycast = () => {};
    wall.name = 'wall';
    group.add(wall);
  }
  obstacles.forEach((o) => {
    const item = new THREE.Group();
    item.name = `obstacle-${o.type}`;
    item.position.set(toM(o.x + o.width / 2), toM(o.y + o.height / 2), toM(-depth));
    obstacleParts(o, m).forEach((part) => item.add(part));
    group.add(item);
  });
  group.userData.dispose = () => {
    group.traverse((node) => node.geometry?.dispose());
    Object.values(m).forEach((material) => material.dispose());
  };
  return group;
}
