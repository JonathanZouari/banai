import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../../src/domain/util.js';
import { createRoomScene } from '../../../src/room/roomScene.js';
import { createRoomState, ROOM_DEFAULTS } from '../../../src/room/roomState.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', '..', 'src');
const memory = () => ({ getItem: () => null, setItem: () => {} });
const sources = (dir) => readdirSync(join(src, dir)).filter((f) => f.endsWith('.js')).map((f) => [`${dir}/${f}`, readFileSync(join(src, dir, f), 'utf-8')]);

describe('the room is decoration only', () => {
  it('room changes never touch the design store (same state object, same revision)', () => {
    const store = createStore({ design: loadDesign('basic'), revision: 1, catalog: loadCatalog() });
    const before = store.getState();
    const room = createRoomState({ storage: memory() });
    room.set({ enabled: true, size: { width: 3000, length: 3000, height: 2500 }, wardrobeAt: 'left' });
    room.set({ enabled: false });
    expect(store.getState()).toBe(before);
  });

  it('saving, the chat agent, the PDF export and the thumbnails never import the room', () => {
    const files = [...sources('api'), ...sources('share'), ...sources('export'), ...sources('state'), ...sources('domain'), ...sources('chat'),
      ['viewer/snapshot.js', readFileSync(join(src, 'viewer', 'snapshot.js'), 'utf-8')],
      ['viewer/buildWardrobe.js', readFileSync(join(src, 'viewer', 'buildWardrobe.js'), 'utf-8')]];
    const offenders = files.filter(([, code]) => /from ['"][./]*\/?room\//.test(code) || /['"]\.\.\/room\//.test(code)).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('builds around a frozen design without changing it, and restores the viewer exactly when off', () => {
    const design = deepFreeze(loadDesign('basic'));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eceeec');
    const hemi = new THREE.HemisphereLight('#ffffff', '#c9c4b8', 2.2);
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight('#ffffff', 0.9);
    fill.position.set(-2, 2, 5);
    const grid = new THREE.GridHelper(12, 24);
    scene.add(hemi, key, fill, grid);
    const snapshot = () => JSON.stringify([scene.background, hemi.color, hemi.groundColor, hemi.intensity, key.color, key.intensity, key.position, key.target.position, fill.color, fill.intensity, fill.position, grid.visible]);
    const before = snapshot();

    const roomScene = createRoomScene({ scene, lights: { hemi, key, fill }, grid });
    const box = roomScene.update(design, { ...ROOM_DEFAULTS, enabled: true });
    expect(box).not.toBeNull();
    expect(scene.getObjectByName('room')).toBeTruthy();
    expect(grid.visible).toBe(false);
    expect(snapshot()).not.toBe(before);

    expect(roomScene.update(design, { ...ROOM_DEFAULTS, enabled: false })).toBeNull();
    expect(scene.getObjectByName('room')).toBeUndefined();
    expect(snapshot()).toBe(before);
  });

  it('the cutaway hides the walls the camera is outside of, and the ceiling from above', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eceeec');
    const lights = { hemi: new THREE.HemisphereLight(), key: new THREE.DirectionalLight(), fill: new THREE.DirectionalLight() };
    const roomScene = createRoomScene({ scene, lights, grid: null });
    roomScene.update(loadDesign('basic'), { ...ROOM_DEFAULTS, enabled: true });
    const visible = () => Object.fromEntries(['back', 'left', 'right', 'front'].map((n) => [n, scene.getObjectByName(`wall-${n}`).visible]));
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 1.65, 3); // inside
    roomScene.frame(camera);
    expect(visible()).toEqual({ back: true, left: true, right: true, front: true });
    expect(scene.getObjectByName('ceiling').visible).toBe(true);
    camera.position.set(8, 4, 9); // outside, front-right, above
    roomScene.frame(camera);
    expect(visible()).toEqual({ back: true, left: true, right: false, front: false });
    expect(scene.getObjectByName('ceiling').visible).toBe(false);
    expect(scene.getObjectByName('window-view').visible).toBe(false); // never beside the room from outside
  });
});
