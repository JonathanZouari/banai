// The room in 3D (viewer/walls3d.js, ADR-037): walls at the plan's size in the wardrobe's frame, mitred corners,
// a floor, and the cut-away that fades the walls the camera looks through.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { FADED_OPACITY, buildWalls, cutAway, roomHeight, wallFootprints } from '../../../src/viewer/walls3d.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const two = loadDesign('two'); // 1000 x 2000 x 500
const rect = { kind: 'rect', width: 3500, depth: 4000 };
const design = applyOps(two, [{ op: 'set_room', shape: rect }], catalog); // wall 0, offset 1250
const mm = (v) => Math.round(v * 1000) + 0; // never -0
const extent = (object) => {
  const box = new THREE.Box3().setFromObject(object);
  return [mm(box.min.x), mm(box.max.x), mm(box.min.y), mm(box.max.y), mm(box.min.z), mm(box.max.z)];
};

describe('walls in 3D', () => {
  it('mitres the outer corners of a rectangle', () => {
    expect(wallFootprints(rect, 100)[0]).toEqual([[0, 0], [3500, 0], [3600, -100], [-100, -100]]);
  });

  it('puts the wardrobe wall behind the carcass and the room around it, with a floor', () => {
    const group = buildWalls(design);
    expect(group.children.map((c) => c.name)).toEqual(['room-floor', 'room-wall-0', 'room-wall-1', 'room-wall-2', 'room-wall-3']);
    // x: the wall starts 1250 left of the wardrobe and runs 3500, plus the corners; z: 100 thick behind the back.
    expect(extent(group.getObjectByName('room-wall-0'))).toEqual([-1350, 2350, 0, 2600, -600, -500]);
    expect(extent(group.getObjectByName('room-wall-2'))).toEqual([-1350, 2350, 0, 2600, 3500, 3600]);
    expect(extent(group.getObjectByName('room-floor')).slice(0, 2)).toEqual([-1250, 2250]);
    group.userData.dispose();
  });

  it('is as high as the measured ceiling, else 2.6 m', () => {
    expect(roomHeight(design)).toBe(2600);
    expect(roomHeight(applyOps(design, [{ op: 'set_site', ceiling: 2750 }], catalog))).toBe(2750);
    expect(buildWalls(two)).toBeNull();
  });

  it('fades only the walls between the camera and the room', () => {
    const group = buildWalls(design);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0.5, 1.5, 6); // in front, beyond the far wall
    expect(cutAway(group, camera)).toEqual([2]);
    expect(group.getObjectByName('room-wall-2').material.opacity).toBe(FADED_OPACITY);
    expect(group.getObjectByName('room-wall-0').material.opacity).toBe(1);
    camera.position.set(0.5, 1.5, 2); // inside the room
    expect(cutAway(group, camera)).toEqual([]);
    camera.position.set(-3, 1.5, 6); // in front and to the left, beyond two walls
    expect(cutAway(group, camera)).toEqual([2, 3]);
    group.userData.dispose();
  });
});
