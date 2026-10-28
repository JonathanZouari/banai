// The room around the wardrobe in the 3D view: decoration only. Built from the design's size and
// the room setup (roomState), never from or into the design. Walls face inward and each wall hides
// together with its trim when the camera is outside it, so orbiting never looks through a wall and
// nothing floats. The viewer's own lights are retuned while the room is on and restored exactly
// when it is off. Performance: shared materials, no shadow maps, soft shadow quads instead.
import * as THREE from 'three';
import { toM } from '../viewer/units.js';
import { roomBox, wardrobeFootprint } from './layout.js';
import { FLOOR_TILE_M, floorTexture, softShadowTexture, viewTexture } from './textures.js';
import { FURNITURE } from './catalog.js';
import { buildFurniture, createFurnitureMaterials } from './furniture.js';
import { placeFurniture } from './placement.js';

// ASSUMPTION: visual palette, chosen so the white wardrobe stays clearly lighter than the walls.
export const ROOM_LOOK = Object.freeze({
  wall: '#e2d6c5',
  ceiling: '#f4efe8',
  trim: '#f6f2ec',
  floor: Object.freeze({ kind: 'wood', color: '#b98d63' }),
  outside: '#e9e4df',
  corridor: '#d8cdbf',
});

const LIGHTS = Object.freeze({
  background: ROOM_LOOK.outside,
  hemi: { sky: '#fff8ee', ground: '#a8937a', intensity: 1.35 },
  key: { color: '#fff0d8', intensity: 2.1 },
  fill: { color: '#eef1ff', intensity: 0.75 },
});

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
  const frame = 0.05;
  const depth = 0.14;
  right.add(
    boxMesh(materials.trim, [wb - wa + 2 * frame, frame, depth], [(wa + wb) / 2, wy1 + frame / 2, -depth / 2 + 0.03]),
    boxMesh(materials.trim, [wb - wa + 2 * frame, frame, depth], [(wa + wb) / 2, wy0 - frame / 2, -depth / 2 + 0.03]),
    boxMesh(materials.trim, [frame, wy1 - wy0, depth], [wa - frame / 2, (wy0 + wy1) / 2, -depth / 2 + 0.03]),
    boxMesh(materials.trim, [frame, wy1 - wy0, depth], [wb + frame / 2, (wy0 + wy1) / 2, -depth / 2 + 0.03]),
    boxMesh(materials.trim, [0.035, wy1 - wy0, 0.05], [(wa + wb) / 2, (wy0 + wy1) / 2, -0.04]),
    boxMesh(materials.trim, [wb - wa + 0.16, 0.03, 0.2], [(wa + wb) / 2, wy0 - 0.015, 0.06]), // inner sill
  );
  const view = plane(materials.view, wb - wa + 3.2, 3.2);
  view.position.set((wa + wb) / 2, (wy0 + wy1) / 2 + 0.3, -1.4);
  view.rotation.y = 0; // the wall's frame: +z is inward, so the view faces into the room from outside
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

  return { group, walls, ceiling, box, materials, furniture: placed };
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
    textures = { floor: floorTexture(look.floor.kind, look.floor.color), view: viewTexture(false), shadow: textures?.shadow ?? softShadowTexture() };
    return textures;
  };

  function applyLights(box, design) {
    const { width, height, depth } = design.dimensions;
    scene.background.set(LIGHTS.background);
    lights.hemi.color.set(LIGHTS.hemi.sky);
    lights.hemi.groundColor.set(LIGHTS.hemi.ground);
    lights.hemi.intensity = LIGHTS.hemi.intensity;
    // The sun comes in through the window, from the front-right: it lights the wardrobe's front
    // fully while the walls catch it at a grazing angle, so the wardrobe stands out from the wall.
    lights.key.color.set(LIGHTS.key.color);
    lights.key.intensity = LIGHTS.key.intensity;
    lights.key.position.set(m(box.x1) + 1.2, 3.2, m(box.window.z1) + 1.8);
    lights.key.target.position.set(m(width) / 2, m(height) * 0.4, -m(depth) / 2);
    lights.fill.color.set(LIGHTS.fill.color);
    lights.fill.intensity = LIGHTS.fill.intensity;
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
      const look = ROOM_LOOK;
      const key = JSON.stringify([design.dimensions, design.compartments.map((c) => c.width), design.doors, room]);
      if (key !== builtKey) {
        remove();
        built = buildRoom(design, room, look, ownTextures(look));
        builtKey = key;
        scene.add(built.group);
      }
      applyLights(built.box, design);
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
      const inside = p.x > m(box.x0) && p.x < m(box.x1) && p.z > m(box.zBack) && p.z < m(box.zFront);
      built.ceiling.visible = inside && p.y < m(box.height);
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
    },
  };
}
