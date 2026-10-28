// The room around the wardrobe in the 3D view: decoration only. Built from the design's size and
// the room setup (roomState), never from or into the design. Walls face inward and each wall hides
// together with its trim when the camera is outside it, so orbiting never looks through a wall and
// nothing floats. The viewer's own lights are retuned while the room is on and restored exactly
// when it is off. Performance: shared materials, no shadow maps, soft shadow quads instead.
import * as THREE from 'three';
import { toM } from '../viewer/units.js';
import { roomBox, wardrobeFootprint } from './layout.js';
import { FLOOR_TILE_M, floorTexture, softGlowTexture, softShadowTexture, viewTexture } from './textures.js';
import { FLOORS, LIGHT_MOODS, WALL_COLORS } from './look.js';
import { FURNITURE } from './catalog.js';
import { buildFurniture, createFurnitureMaterials } from './furniture.js';
import { placeFurniture } from './placement.js';
import { doorSwings, inTheWay } from './swing.js';

// ASSUMPTION: visual palette for the fixed parts; walls, floors and light moods are in look.js.
export const ROOM_LOOK = Object.freeze({
  ceiling: '#f4efe8',
  trim: '#f6f2ec',
  corridor: '#d8cdbf',
});

/** The look for a room setup: wall colour, floor and the light mood. */
const lookOf = (room) => ({ wall: WALL_COLORS[room.wall], floor: FLOORS[room.floor], mood: LIGHT_MOODS[room.light], evening: room.light === 'evening' });

const m = toM;
const standard = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });

function plane(material, width, height) {
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

/** A wall with optional rectangular holes, in its own plane (x along the wall, y up). */
function wallMesh(material, length, height, holes = []) {
  if (!holes.length) {
    const mesh = plane(material, length, height);
    mesh.position.set(length / 2, height / 2, 0);
    return mesh;
  }
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(length, 0), new THREE.Vector2(length, height), new THREE.Vector2(0, height)]);
  holes.forEach(([a, b, y0, y1]) => shape.holes.push(new THREE.Path([new THREE.Vector2(a, y0), new THREE.Vector2(b, y0), new THREE.Vector2(b, y1), new THREE.Vector2(a, y1)])));
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

const boxMesh = (material, [w, h, d], [x, y, z]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
};

/**
 * A wall group: built in the wall's own frame (x along the wall from `origin`, y up, +z = inward),
 * then turned into place. `inward` is the normal pointing into the room (for the cutaway).
 */
function wallGroup(name, origin, rotationY, inward) {
  const group = new THREE.Group();
  group.name = `wall-${name}`;
  group.position.copy(origin);
  group.rotation.y = rotationY;
  group.userData = { point: origin.clone(), inward };
  return group;
}

function buildRoom(design, room, look, textures) {
  const box = roomBox(design, room);
  const [x0, x1, zb, zf, h] = [m(box.x0), m(box.x1), m(box.zBack), m(box.zFront), m(box.height)];
  const width = x1 - x0;
  const length = zf - zb;
  const materials = {
    wall: standard(look.wall, 0.95),
    ceiling: standard(ROOM_LOOK.ceiling, 1),
    trim: standard(ROOM_LOOK.trim, 0.6),
    corridor: standard(ROOM_LOOK.corridor, 1),
    floor: new THREE.MeshStandardMaterial({ color: textures.floor ? '#ffffff' : look.floor.color, map: textures.floor, roughness: look.floor.kind === 'carpet' ? 1 : 0.65 }),
    view: new THREE.MeshBasicMaterial({ color: textures.view ? '#ffffff' : '#9cc58c', map: textures.view, toneMapped: false }),
    shadow: new THREE.MeshBasicMaterial({ color: '#000000', map: textures.shadow, transparent: true, depthWrite: false, opacity: 0.32 }),
  };
  if (textures.floor) {
    const tile = { wood: 1.6, tiles: 1.2, carpet: 1 }[look.floor.kind] ?? FLOOR_TILE_M.wood;
    textures.floor.repeat.set(width / tile, length / tile);
  }
  const group = new THREE.Group();
  group.name = 'room';
  const walls = [];
  const skirting = (wall, from, to) => wall.add(boxMesh(materials.trim, [to - from, 0.07, 0.012], [(from + to) / 2, 0.035, 0.006]));

  // Floor (plus the doorway threshold) and ceiling (faces down: invisible from above).
  const floor = plane(materials.floor, width, length);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, (zb + zf) / 2);
  const ceiling = plane(materials.ceiling, width, length);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((x0 + x1) / 2, h, (zb + zf) / 2);
  ceiling.name = 'ceiling';
  group.add(floor, ceiling);

  // Back wall, with a soft darker halo behind the wardrobe so it stands off the wall.
  const back = wallGroup('back', new THREE.Vector3(x0, 0, zb), 0, new THREE.Vector3(0, 0, 1));
  back.add(wallMesh(materials.wall, width, h));
  skirting(back, 0, width);
  const { width: dw, height: dh } = design.dimensions;
  const halo = plane(materials.shadow.clone(), m(dw) + 0.4, m(dh) + 0.3);
  halo.material.opacity = 0.2;
  halo.position.set(m(dw) / 2 - x0, (m(dh) + 0.15) / 2, 0.002);
  back.add(halo);

  // Left wall.
  const left = wallGroup('left', new THREE.Vector3(x0, 0, zf), Math.PI / 2, new THREE.Vector3(1, 0, 0));
  left.add(wallMesh(materials.wall, length, h));
  skirting(left, 0, length);

  // Right wall with the window: frame, sill, mullion and the generated view outside.
  const win = box.window;
  const right = wallGroup('right', new THREE.Vector3(x1, 0, zb), -Math.PI / 2, new THREE.Vector3(-1, 0, 0));
  const [wa, wb, wy0, wy1] = [m(win.z0) - zb, m(win.z1) - zb, m(win.y0), m(win.y1)];
  right.add(wallMesh(materials.wall, length, h, [[wa, wb, wy0, wy1]]));
  skirting(right, 0, length);
  // The frame sits inside the room (only 1 cm reaches past the wall plane), so nothing sticks out
  // of the wall in the floor plan or from outside.
  const frame = 0.05;
  const depth = 0.12;
  const inward = depth / 2 - 0.01;
  right.add(
    boxMesh(materials.trim, [wb - wa + 2 * frame, frame, depth], [(wa + wb) / 2, wy1 + frame / 2, inward]),
    boxMesh(materials.trim, [wb - wa + 2 * frame, frame, depth], [(wa + wb) / 2, wy0 - frame / 2, inward]),
    boxMesh(materials.trim, [frame, wy1 - wy0, depth], [wa - frame / 2, (wy0 + wy1) / 2, inward]),
    boxMesh(materials.trim, [frame, wy1 - wy0, depth], [wb + frame / 2, (wy0 + wy1) / 2, inward]),
    boxMesh(materials.trim, [0.035, wy1 - wy0, 0.04], [(wa + wb) / 2, (wy0 + wy1) / 2, 0.02]),
    boxMesh(materials.trim, [wb - wa + 0.16, 0.03, 0.2], [(wa + wb) / 2, wy0 - 0.015, 0.06]), // inner sill
  );
  const view = plane(materials.view, wb - wa + 3.2, 3.2);
  view.position.set((wa + wb) / 2, (wy0 + wy1) / 2 + 0.3, -1.4);
  view.rotation.y = 0; // the wall's frame: +z is inward, so the view faces into the room from outside
  view.name = 'window-view';
  right.add(view);

  // Front wall with the doorway (architrave) and a glimpse of the corridor behind it.
  const door = box.door;
  const front = wallGroup('front', new THREE.Vector3(x1, 0, zf), Math.PI, new THREE.Vector3(0, 0, -1));
  const [da, db, dhh] = [x1 - m(door.x1), x1 - m(door.x0), m(door.height)];
  front.add(wallMesh(materials.wall, width, h, [[da, db, 0, dhh]]));
  skirting(front, 0, da);
  skirting(front, db, width);
  front.add(
    boxMesh(materials.trim, [db - da + 0.14, 0.07, 0.03], [(da + db) / 2, dhh + 0.035, 0.012]),
    boxMesh(materials.trim, [0.07, dhh, 0.03], [da - 0.035, dhh / 2, 0.012]),
    boxMesh(materials.trim, [0.07, dhh, 0.03], [db + 0.035, dhh / 2, 0.012]),
  );
  const corridor = plane(materials.corridor, db - da + 1.6, h);
  corridor.position.set((da + db) / 2, h / 2, -1.3);
  const threshold = plane(materials.floor, db - da, 1.3);
  threshold.rotation.x = -Math.PI / 2;
  threshold.position.set((da + db) / 2, 0, -0.65);
  front.add(corridor, threshold);

  [back, left, right, front].forEach((wall) => {
    walls.push(wall);
    group.add(wall);
  });

  // Contact shadow under the wardrobe: grounds it on the floor.
  const foot = wardrobeFootprint(design);
  const shadow = plane(materials.shadow, m(foot.x1 - foot.x0) + 0.2, m(foot.z1 - foot.z0) + 0.22);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(m(foot.x0 + foot.x1) / 2, 0.002, m(foot.z0 + foot.z1) / 2);
  group.add(shadow);

  // Furniture for the chosen style, placed by the solver: clear of the wardrobe, the walls, the
  // doorway and every sightline from the doorway to the wardrobe's front.
  const furnitureMaterials = createFurnitureMaterials();
  furnitureMaterials.shade.emissiveIntensity = look.mood.lampGlow; // lamp shades glow in the evening
  const { placed } = placeFurniture(design, room, room.preset);
  placed.forEach((piece) => {
    const item = buildFurniture(piece.kind, furnitureMaterials);
    item.position.set(m(piece.x), 0, m(piece.z));
    item.rotation.y = THREE.MathUtils.degToRad(piece.rotation);
    group.add(item);
    if (FURNITURE[piece.kind].underlay) return;
    const { rect } = piece;
    const soft = plane(materials.shadow, m(rect.x1 - rect.x0) + 0.14, m(rect.z1 - rect.z0) + 0.14);
    soft.rotation.x = -Math.PI / 2;
    soft.position.set(m(rect.x0 + rect.x1) / 2, 0.003, m(rect.z0 + rect.z1) / 2);
    group.add(soft);
  });

  // Light on the floor, without extra lights or shadow maps: a soft sun patch near the window in
  // the morning, warm pools under the lamps in the evening (additive, so they only brighten).
  const glow = (color, opacity, w, d, x, z) => {
    const patch = plane(new THREE.MeshBasicMaterial({ color, map: textures.glow, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }), w, d);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.004, z);
    group.add(patch);
  };
  if (look.mood.sunPatch) {
    // Along the window wall (x), a little toward the back: the sun comes from the front-right.
    glow('#ffe1ae', look.mood.sunPatch, 1.5, (wb - wa) * 1.1, x1 - 0.95, (m(win.z0) + m(win.z1)) / 2 - 0.25);
  }
  if (look.mood.lampGlow) {
    placed.filter((p) => p.kind === 'floorLamp' || p.kind === 'nightstand').forEach((p) => glow('#ffb877', 0.42, 1.8, 1.8, m(p.x), m(p.z)));
  }

  if (room.showSwing) group.add(buildSwingAid(design, placed));

  return { group, walls, ceiling, view, box, materials, furniture: placed };
}

// "Does it fit": where the doors open, drawn on the floor. Visual only: no text, no warning, no
// rule. A door whose area a piece of furniture stands in turns amber, and so does that piece.
const SWING_COLOR = '#c2410c';
const IN_THE_WAY = '#d97706';
const FLOOR_Y = 0.006;

/** A flat mesh on the floor from triangles given as [x, z] points in mm. */
function floorMesh(triangles, material) {
  const positions = triangles.flatMap(([x, z]) => [m(x), FLOOR_Y, m(z)]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Mesh(geometry, material);
}

/** A ribbon (a thick line) through points on the floor, `width` mm wide. */
function ribbon(points, width) {
  const triangles = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b] = [points[i], points[i + 1]];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const [nx, nz] = [((a.z - b.z) / length) * (width / 2), ((b.x - a.x) / length) * (width / 2)];
    const [a1, a2, b1, b2] = [[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz]];
    triangles.push(a1, a2, b1, b1, a2, b2);
  }
  return triangles;
}

function buildSwingAid(design, placed) {
  const group = new THREE.Group();
  group.name = 'door-swing';
  const solid = placed.filter((p) => !FURNITURE[p.kind].underlay);
  const look = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const blocking = new Set();
  doorSwings(design).forEach((swing) => {
    const hits = solid.filter((p) => inTheWay(swing, p.rect));
    hits.forEach((p) => blocking.add(p));
    const color = hits.length ? IN_THE_WAY : SWING_COLOR;
    if (swing.type === 'hinged') {
      const [hinge, ...arc] = swing.polygon;
      const fan = arc.slice(1).flatMap((p, i) => [[hinge.x, hinge.z], [arc[i].x, arc[i].z], [p.x, p.z]]);
      group.add(floorMesh(fan, look(color, hits.length ? 0.26 : 0.16)));
      group.add(floorMesh([...ribbon(arc, 22), ...ribbon([hinge, arc.at(-1)], 14)], look(color, 0.9)));
    } else {
      const { x0, x1, z0, z1 } = swing.rect;
      group.add(floorMesh([[x0, z0], [x1, z0], [x0, z1], [x0, z1], [x1, z0], [x1, z1]], look(color, 0.16)));
      group.add(floorMesh([...ribbon([{ x: x0, z: z1 }, { x: x1, z: z1 }], 14), ...ribbon([{ x: x0, z: z0 + 10 }, { x: x1, z: z0 + 10 }], 10)], look(color, 0.9)));
    }
  });
  // Pieces in the way: an amber footprint and outline.
  const lines = new THREE.LineBasicMaterial({ color: IN_THE_WAY });
  blocking.forEach((piece) => {
    const { x0, x1, z0, z1 } = piece.rect;
    group.add(floorMesh([[x0, z0], [x1, z0], [x0, z1], [x0, z1], [x1, z0], [x1, z1]], look(IN_THE_WAY, 0.22)));
    const size = [m(x1 - x0), m(FURNITURE[piece.kind].height), m(z1 - z0)];
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), lines);
    edges.position.set(m(x0 + x1) / 2, size[1] / 2, m(z0 + z1) / 2);
    edges.name = `in-the-way-${piece.id}`;
    group.add(edges);
  });
  return group;
}

/** All geometries and materials of a group (textures are owned and disposed separately). */
function disposeGroup(group) {
  const materials = new Set();
  group.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) materials.add(object.material);
  });
  materials.forEach((material) => material.dispose());
}

/**
 * scene: the viewer's scene; lights: { hemi, key, fill } (the viewer's own); grid: the floor grid.
 * update(design, room) builds or hides the room; frame(camera) runs the cutaway every frame.
 */
export function createRoomScene({ scene, lights, grid }) {
  const original = {
    background: scene.background.clone(),
    hemi: { sky: lights.hemi.color.clone(), ground: lights.hemi.groundColor.clone(), intensity: lights.hemi.intensity },
    key: { color: lights.key.color.clone(), intensity: lights.key.intensity, position: lights.key.position.clone(), target: lights.key.target.position.clone() },
    fill: { color: lights.fill.color.clone(), intensity: lights.fill.intensity, position: lights.fill.position.clone() },
  };
  if (!lights.key.target.parent) scene.add(lights.key.target);
  let built = null;
  let builtKey = null;
  let textures = null;

  const ownTextures = (look) => {
    textures?.floor?.dispose();
    textures?.view?.dispose();
    textures = {
      floor: floorTexture(look.floor.kind, look.floor.color),
      view: viewTexture(look.evening),
      shadow: textures?.shadow ?? softShadowTexture(),
      glow: textures?.glow ?? softGlowTexture(),
    };
    return textures;
  };

  function applyLights(box, design, mood) {
    const { width, height, depth } = design.dimensions;
    scene.background.set(mood.background);
    lights.hemi.color.set(mood.hemi.sky);
    lights.hemi.groundColor.set(mood.hemi.ground);
    lights.hemi.intensity = mood.hemi.intensity;
    // The sun comes in through the window, from the front-right: it lights the wardrobe's front
    // fully while the walls catch it at a grazing angle, so the wardrobe stands out from the wall.
    lights.key.color.set(mood.key.color);
    lights.key.intensity = mood.key.intensity;
    lights.key.position.set(m(box.x1) + 1.2, 3.2, m(box.window.z1) + 1.8);
    lights.key.target.position.set(m(width) / 2, m(height) * 0.4, -m(depth) / 2);
    lights.fill.color.set(mood.fill.color);
    lights.fill.intensity = mood.fill.intensity;
    lights.fill.position.set(m(box.x0 + box.x1) / 2 - 1, 1.6, m(box.zFront) + 2); // soft front light, like a room's ambient bounce
  }

  function restoreLights() {
    scene.background.copy(original.background);
    lights.hemi.color.copy(original.hemi.sky);
    lights.hemi.groundColor.copy(original.hemi.ground);
    lights.hemi.intensity = original.hemi.intensity;
    lights.key.color.copy(original.key.color);
    lights.key.intensity = original.key.intensity;
    lights.key.position.copy(original.key.position);
    lights.key.target.position.copy(original.key.target);
    lights.fill.color.copy(original.fill.color);
    lights.fill.intensity = original.fill.intensity;
    lights.fill.position.copy(original.fill.position);
  }

  const remove = () => {
    if (!built) return;
    scene.remove(built.group);
    disposeGroup(built.group);
    built = null;
    builtKey = null;
  };

  return {
    /** Build, rebuild or hide the room for this design and setup. Returns the room box or null. */
    update(design, room) {
      if (!room.enabled) {
        remove();
        restoreLights();
        if (grid) grid.visible = true;
        return null;
      }
      const look = lookOf(room);
      const key = JSON.stringify([design.dimensions, design.compartments.map((c) => c.width), design.doors, room]);
      if (key !== builtKey) {
        remove();
        built = buildRoom(design, room, look, ownTextures(look));
        builtKey = key;
        scene.add(built.group);
      }
      applyLights(built.box, design, look.mood);
      if (grid) grid.visible = false;
      return built.box;
    },
    /** Every frame: hide each wall the camera is outside of, and the ceiling from outside or above. */
    frame(camera) {
      if (!built) return;
      const p = camera.position;
      built.walls.forEach((wall) => {
        const { point, inward } = wall.userData;
        wall.visible = (p.x - point.x) * inward.x + (p.z - point.z) * inward.z > 0;
      });
      const { box } = built;
      // Inside, or standing in the doorway (the threshold view): the ceiling stays.
      const inside = p.x > m(box.x0) && p.x < m(box.x1) && p.z > m(box.zBack) && p.z < m(box.zFront) + 0.6;
      built.ceiling.visible = inside && p.y < m(box.height);
      // The landscape is only ever seen through the window, never beside the room from outside.
      built.view.visible = built.ceiling.visible;
    },
    get group() {
      return built?.group ?? null;
    },
    get box() {
      return built?.box ?? null;
    },
    get furniture() {
      return built?.furniture ?? [];
    },
    dispose() {
      remove();
      restoreLights();
      textures?.floor?.dispose();
      textures?.view?.dispose();
      textures?.shadow?.dispose();
      textures?.glow?.dispose();
    },
  };
}
