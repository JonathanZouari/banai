import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { applyDoorMotion } from '../../../src/viewer/doorMotion.js';
import { FLASH_MS, createFlasher, flashLevel, resolveFlashTargets } from '../../../src/viewer/flash.js';
import { createHardware } from '../../../src/viewer/hardware.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (options = {}) => buildWardrobe(basic, createMaterials(catalog), { doorsVisible: true, hardware: createHardware(), ...options });
const mm = (box) => [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z].map((v) => Math.round(v * 1e4) / 10 + 0);

describe('resolveFlashTargets', () => {
  it('resolves the carcass to the whole body', () => {
    const [{ target, box }] = resolveFlashTargets(['carcass'], basic);
    expect(target).toBe('carcass');
    expect(mm(box)).toEqual([0, 2000, 0, 2400, -600, 0]);
  });

  it('resolves comp:<index> to that compartment interior', () => {
    const [{ box }] = resolveFlashTargets(['comp:1'], basic);
    expect(mm(box)).toEqual([679, 1322, 18, 2382, -594, 0]);
  });

  it('resolves door:<id> to the door mesh as posed, or its closed layout without one', () => {
    const group = build();
    const [{ box: closed }] = resolveFlashTargets(['door:dr_middle'], basic, group);
    expect(mm(closed).slice(0, 4)).toEqual([671.5, 1329.5, 1.5, 2398.5]);
    applyDoorMotion(group, 1);
    const [{ box: open }] = resolveFlashTargets(['door:dr_middle'], basic, group);
    expect(open.max.z).toBeGreaterThan(0.5); // swung out toward the viewer
    const [{ box: hidden }] = resolveFlashTargets(['door:dr_middle'], basic, build({ doorsVisible: false }));
    expect(mm(hidden)).toEqual([671.5, 1329.5, 1.5, 2398.5, 0, 18]);
  });

  it('keeps the order, drops duplicates and skips anything it cannot resolve', () => {
    const targets = ['comp:2', 'carcass', 'comp:2', 'door:dr_nope', 'comp:9', 'comp:-1', 'comp:1.5', 'comp:', 'door:', 42, null, 'shelf:shf_l1'];
    expect(resolveFlashTargets(targets, basic).map((r) => r.target)).toEqual(['comp:2', 'carcass']);
    expect(resolveFlashTargets('carcass', basic)).toEqual([]);
    expect(resolveFlashTargets(['carcass'], null)).toEqual([]);
  });
});

describe('flash pulse', () => {
  it('rises and falls once over FLASH_MS, or holds steady with reduced motion', () => {
    expect(FLASH_MS).toBe(1200);
    expect(flashLevel(0)).toBe(0);
    expect(flashLevel(FLASH_MS / 2)).toBeCloseTo(1, 9);
    expect(flashLevel(FLASH_MS)).toBe(0);
    expect(flashLevel(-5)).toBe(0);
    expect(flashLevel(Number.NaN)).toBe(0);
    expect(flashLevel(0, true)).toBe(flashLevel(FLASH_MS - 1, true));
    expect(flashLevel(0, true)).toBeGreaterThan(0.5);
    expect(flashLevel(FLASH_MS, true)).toBe(0);
  });

  it('draws on top of everything, never raycasts, and clears itself when the pulse ends', () => {
    const scene = new THREE.Scene();
    const flasher = createFlasher(scene);
    const layer = scene.getObjectByName('flash');
    expect(flasher.show(resolveFlashTargets(['carcass', 'comp:0'], basic), { now: 1000 })).toBe(2);
    expect(flasher.count).toBe(2);
    expect(layer.children).toHaveLength(4); // a fill and an outline per part
    layer.children.forEach((child) => {
      expect(child.material.depthTest).toBe(false);
      expect(new THREE.Raycaster(new THREE.Vector3(1, 1, 5), new THREE.Vector3(0, 0, -1)).intersectObject(child)).toHaveLength(0);
    });
    flasher.step(1000 + FLASH_MS / 2);
    expect(layer.children[0].material.opacity).toBeCloseTo(0.16, 9);
    expect(layer.children[1].material.opacity).toBeCloseTo(0.95, 9);
    flasher.step(1000 + FLASH_MS);
    expect(flasher.active).toBe(false);
    expect(layer.children).toHaveLength(0);
    flasher.dispose();
    expect(scene.getObjectByName('flash')).toBeUndefined();
  });

  it('replaces a running flash, shows a steady highlight with reduced motion, and ignores an empty list', () => {
    const scene = new THREE.Scene();
    const flasher = createFlasher(scene);
    flasher.show(resolveFlashTargets(['carcass'], basic), { now: 0 });
    expect(flasher.show(resolveFlashTargets(['comp:0', 'comp:1', 'comp:2'], basic), { now: 0, reducedMotion: true })).toBe(3);
    expect(flasher.count).toBe(3);
    const fill = scene.getObjectByName('flash').children[0].material;
    const steady = fill.opacity;
    expect(steady).toBeGreaterThan(0);
    flasher.step(FLASH_MS / 4);
    expect(fill.opacity).toBe(steady);
    expect(flasher.show([], { now: 0 })).toBe(0);
    expect(flasher.active).toBe(false);
    flasher.dispose();
  });
});
