// Interior inserts (schema v2): every part is tagged for picking/highlighting and stays in its zone.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import {
  LED_EMISSIVE_INTENSITY, LED_LIGHT_INTENSITY, buildInserts, insertZone, ledLevel, ledLightsOf, setLedLevel,
} from '../../../src/viewer/builders/inserts.js';
import { describeInsert, describeSelection } from '../../../src/viewer/format.js';
import { createHighlighter } from '../../../src/viewer/highlight.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { buildProps, disposeProps } from '../../../src/viewer/props.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const PLINTH = 100;
const BASE = PLINTH + 18; // floor height of interior y = 0
// cmp_left (x 18..661) emptied, then all four inserts: shoes [0, 720], trousers [800, 1500], pull-down at 1900, LED.
const design = applyOps(basic, [
  { op: 'update_dimensions', plinthHeight: PLINTH },
  ...['shf_l1', 'shf_l2', 'shf_l3', 'shf_l4'].map((id) => ({ op: 'remove_component', id })),
  { op: 'add_insert', compartmentId: 'cmp_left', type: 'shoes', y: 0, tiers: 3, id: 'ins_shoes' },
  { op: 'add_insert', compartmentId: 'cmp_left', type: 'trousers', y: 800, height: 700, id: 'ins_trousers' },
  { op: 'add_insert', compartmentId: 'cmp_left', type: 'pulldown', y: 1900, id: 'ins_pull' },
  { op: 'add_insert', compartmentId: 'cmp_left', type: 'led', id: 'ins_led' },
], catalog);
const materials = createMaterials(catalog);
const group = buildWardrobe(design, materials, { doorsVisible: true });
const partsOf = (id) => group.children.filter((m) => m.userData.componentId === id);
/** World y-range of a component's meshes, in mm (0.1 mm). */
const yRange = (id) => {
  const box = new THREE.Box3();
  partsOf(id).forEach((mesh) => box.expandByObject(mesh));
  return [Math.round(box.min.y * 1e4) / 10, Math.round(box.max.y * 1e4) / 10];
};
const xzBox = (id) => {
  const box = new THREE.Box3();
  partsOf(id).forEach((mesh) => box.expandByObject(mesh));
  return box;
};

describe('insert meshes', () => {
  it('tags every part with the insert id, kind insert and its compartment', () => {
    const ids = ['ins_shoes', 'ins_trousers', 'ins_pull', 'ins_led'];
    ids.forEach((id) => {
      const parts = partsOf(id);
      expect(parts.length).toBeGreaterThan(0);
      parts.forEach((mesh) => {
        expect(mesh.isMesh).toBe(true);
        expect(mesh.userData).toMatchObject({ componentId: id, kind: 'insert', compartmentId: 'cmp_left' });
      });
    });
    expect(partsOf('ins_shoes').every((m) => m.userData.insertType === 'shoes')).toBe(true);
    // Only meshes are direct children (the LED light hangs under its strip).
    expect(group.children.every((child) => child.isMesh)).toBe(true);
  });

  it('builds sloped shoe shelves inside [y, y + tiers x 240]', () => {
    expect(insertZone({ type: 'shoes', y: 0, tiers: 3 })).toEqual([0, 720]);
    const [low, high] = yRange('ins_shoes');
    expect(low).toBeGreaterThanOrEqual(BASE);
    expect(high).toBeLessThanOrEqual(BASE + 720);
    expect(high).toBeGreaterThan(BASE + 480); // the third tier is there
    const shelves = partsOf('ins_shoes').filter((m) => m.geometry.type === 'BoxGeometry');
    expect(shelves).toHaveLength(3);
    shelves.forEach((shelf) => expect(shelf.rotation.x).toBeGreaterThan(0.2)); // front edge low
  });

  it('builds the trouser pull-out with its rods inside [y, y + height]', () => {
    expect(insertZone({ type: 'trousers', y: 800, height: 700 })).toEqual([800, 1500]);
    const [low, high] = yRange('ins_trousers');
    expect(low).toBeGreaterThanOrEqual(BASE + 800);
    expect(high).toBeLessThanOrEqual(BASE + 1500);
    const rods = partsOf('ins_trousers').filter((m) => m.geometry.type === 'CylinderGeometry');
    expect(rods.length).toBeGreaterThanOrEqual(4);
    rods.forEach((rod) => {
      expect(rod.position.x * 1000).toBeGreaterThan(18);
      expect(rod.position.x * 1000).toBeLessThan(661);
    });
  });

  it('puts the pull-down rail at y, on two arms that stay under the top', () => {
    const [rail, ...rest] = partsOf('ins_pull');
    expect(rail.geometry.type).toBe('CylinderGeometry');
    expect(rail.position.y * 1000).toBeCloseTo(BASE + 1900, 6);
    expect(rest.filter((m) => m.geometry.type === 'BoxGeometry')).toHaveLength(2);
    const [, high] = yRange('ins_pull');
    expect(high).toBeLessThanOrEqual(2382); // under the top panel
    // Its pull rod stops above the trouser zone below it (top at 1500).
    const [low] = yRange('ins_pull');
    expect(low).toBeGreaterThan(BASE + 1500);
    expect(insertZone({ type: 'pulldown', y: 1900 })).toEqual([1900, 1900]);
  });

  it('leaves out the pull rod when there is no room below the rail', () => {
    const tight = applyOps(design, [{ op: 'modify_insert', id: 'ins_pull', y: 1560 }], catalog);
    const parts = buildInserts(tight, frameOf(tight), materials).filter((m) => m.userData.componentId === 'ins_pull');
    expect(parts).toHaveLength(3); // rail and two arms
  });

  it('hangs the LED strip under the compartment top with a downward area light', () => {
    const [strip] = partsOf('ins_led');
    const [low, high] = yRange('ins_led');
    expect(high).toBeLessThanOrEqual(2382);
    expect(low).toBeGreaterThan(2382 - 20);
    expect(insertZone({ type: 'led' })).toBeNull();
    const [light] = ledLightsOf(group);
    expect(light.isRectAreaLight).toBe(true);
    expect(light.parent).toBe(strip);
    light.updateMatrixWorld(true);
    const facing = new THREE.Vector3(0, 0, -1).transformDirection(light.matrixWorld);
    expect(facing.y).toBeCloseTo(-1, 9);
    expect(light.visible).toBe(false); // off until the viewer drives it
  });

  it('keeps every insert inside its compartment', () => {
    ['ins_shoes', 'ins_trousers', 'ins_pull', 'ins_led'].forEach((id) => {
      const box = xzBox(id);
      expect(box.min.x).toBeGreaterThanOrEqual(0.018 - 1e-9);
      expect(box.max.x).toBeLessThanOrEqual(0.661 + 1e-9);
      expect(box.max.z).toBeLessThanOrEqual(0);
      expect(box.min.z).toBeGreaterThanOrEqual(-0.594);
    });
  });

  it('ignores unknown insert types and v1 compartments without inserts', () => {
    const odd = structuredClone(design);
    odd.compartments[0].inserts.push({ id: 'ins_x', type: 'safe', y: 0, tiers: null, height: null });
    delete odd.compartments[1].inserts;
    const ids = new Set(buildInserts(odd, frameOf(odd), materials).map((m) => m.userData.componentId));
    expect([...ids].sort()).toEqual(['ins_led', 'ins_pull', 'ins_shoes', 'ins_trousers']);
  });

  it('picks an insert by raycast and highlights all its parts', () => {
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0.34, (BASE + 1900) / 1000, 1), new THREE.Vector3(0, 0, -1));
    const withoutDoors = buildWardrobe(design, materials, { doorsVisible: false });
    withoutDoors.updateMatrixWorld(true);
    const [hit] = ray.intersectObjects(withoutDoors.children, false);
    expect(hit.object.userData.componentId).toBe('ins_pull');
    const scene = new THREE.Scene();
    const highlighter = createHighlighter(scene);
    highlighter.update(withoutDoors, design, { id: 'ins_shoes', kind: 'insert' });
    const outlines = scene.getObjectByName('highlight').children.filter((c) => c.isLineSegments);
    expect(outlines).toHaveLength(partsOf('ins_shoes').length);
    highlighter.dispose();
  });
});

describe('LED level', () => {
  it('follows door openness, and is on without doors', () => {
    expect(ledLevel(design, { doorsVisible: true }, 0)).toBe(0);
    expect(ledLevel(design, { doorsVisible: true }, 0.4)).toBe(0.4);
    expect(ledLevel(design, { doorsVisible: true }, 1)).toBe(1);
    expect(ledLevel(design, { doorsVisible: false }, 0)).toBe(1); // doors hidden: the interior is open
    const none = applyOps(design, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(ledLevel(none, { doorsVisible: true }, 0)).toBe(1);
    expect(ledLevel(design, {}, Number.NaN)).toBe(0);
  });

  it('drives the lights and the emissive strip', () => {
    const lights = ledLightsOf(group);
    setLedLevel(lights, materials.led, 1);
    expect(lights[0].visible).toBe(true);
    expect(lights[0].intensity).toBe(LED_LIGHT_INTENSITY);
    expect(materials.led.emissiveIntensity).toBe(LED_EMISSIVE_INTENSITY);
    setLedLevel(lights, materials.led, 0);
    expect(lights[0].visible).toBe(false);
    expect(materials.led.emissiveIntensity).toBe(0);
  });
});

describe('insert labels and clothes', () => {
  it('describes inserts in Hebrew', () => {
    expect(describeSelection(design, { id: 'ins_shoes', kind: 'insert' })).toBe('מדפי נעליים · 3 קומות · גובה 72.0 ס״מ · 0.0 ס״מ מהבסיס');
    expect(describeInsert({ type: 'trousers', y: 800, height: 700 })).toBe('מתקן מכנסיים · גובה 70.0 ס״מ · 80.0 ס״מ מהבסיס');
    expect(describeInsert({ type: 'pulldown', y: 1900 })).toBe('מתקן תלייה נשלף · 190.0 ס״מ מהבסיס');
    expect(describeInsert({ type: 'led' })).toBe('תאורת LED');
    expect(describeInsert({ type: 'shoes', y: 0, tiers: 1 })).toContain('קומה אחת');
  });

  it('puts shoes on the shoe shelves and trousers on the rack, inside their zones', () => {
    const props = buildProps(design, { seed: 7 });
    const ofPart = (name) => props.children.filter((m) => m.userData.part === name);
    const shoes = ofPart('shoe');
    expect(shoes.length).toBe(3 * 2 * 2); // 3 tiers x 2 pairs (643 mm compartment) x 2 shoes
    shoes.forEach((shoe) => {
      const box = new THREE.Box3().setFromObject(shoe);
      expect(box.min.y * 1000).toBeGreaterThanOrEqual(BASE);
      expect(box.max.y * 1000).toBeLessThanOrEqual(BASE + 720);
    });
    const trousers = ofPart('trousers');
    expect(trousers.length).toBeGreaterThan(0);
    trousers.forEach((item) => {
      const box = new THREE.Box3().setFromObject(item);
      expect(box.min.y * 1000).toBeGreaterThanOrEqual(BASE + 800);
      expect(box.max.y * 1000).toBeLessThanOrEqual(BASE + 1500);
    });
    // Garments hang from the pull-down rail, above the trouser zone.
    const hangers = ofPart('hanger').filter((h) => h.position.x < 0.661);
    expect(hangers.length).toBeGreaterThan(0);
    hangers.forEach((h) => expect(h.position.y * 1000).toBeCloseTo(BASE + 1900, 6));
    disposeProps(props);
  });
});
