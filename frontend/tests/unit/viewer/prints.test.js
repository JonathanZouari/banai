import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe, disposeWardrobe, materialsOf } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import {
  coverTransform, createPrintRegistry, MAX_PRINT_BYTES, PRINT_ERRORS, printMaterial,
} from '../../../src/viewer/prints.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const door = (group, id) => group.children.find((o) => o.userData.componentId === id);

// Node has no DOM canvas: a minimal stand-in records what is drawn.
const fakeCanvas = (width, height) => ({ width, height, drawn: [], getContext() { const c = this; return { drawImage: (...a) => c.drawn.push(a), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, fill() {}, ellipse() {}, createLinearGradient: () => ({ addColorStop() {} }) }; } });
const registry = (decode = async () => ({ width: 4000, height: 3000, close() {} })) => createPrintRegistry({ decode, makeCanvas: fakeCanvas });
const file = (type, size = 1000, name = 'photo.jpg') => ({ type, size, name });

describe('coverTransform', () => {
  it('crops the sides of a wide image on a tall panel', () => {
    const { repeat, offset } = coverTransform(2, 0.5);
    expect(repeat).toEqual([0.25, 1]);
    expect(offset).toEqual([0.375, 0]);
  });

  it('crops top and bottom of a tall image on a wide panel', () => {
    const { repeat, offset } = coverTransform(0.5, 1);
    expect(repeat).toEqual([1, 0.5]);
    expect(offset).toEqual([0, 0.25]);
  });

  it('uses the whole image when the proportions match', () => {
    expect(coverTransform(0.75, 0.75)).toEqual({ repeat: [1, 1], offset: [0, 0] });
  });
});

describe('print registry (browser only)', () => {
  it('accepts PNG/JPEG/WebP and downscales to at most 2048 px', async () => {
    const prints = registry();
    const meta = await prints.load(file('image/jpeg'));
    expect(meta).toMatchObject({ name: 'photo.jpg', width: 2048, height: 1536 });
    expect(prints.has(meta.printId)).toBe(true);
  });

  it('rejects other types, SVG, oversize files and undecodable data with fixed texts', async () => {
    const prints = registry(async () => { throw new Error('<script>bad</script>'); });
    await expect(prints.load(file('image/svg+xml'))).rejects.toThrow(PRINT_ERRORS.type);
    await expect(prints.load(file('text/plain'))).rejects.toThrow(PRINT_ERRORS.type);
    await expect(prints.load(file('image/png', MAX_PRINT_BYTES + 1))).rejects.toThrow(PRINT_ERRORS.size);
    await expect(prints.load(file('image/png'))).rejects.toThrow(PRINT_ERRORS.decode);
    expect(prints.size()).toBe(0);
  });

  it('draws built-in samples and frees prints that are no longer used', () => {
    const prints = registry();
    const a = prints.sample('dunes');
    const b = prints.sample('forest');
    prints.releaseUnused(new Set([b.printId]));
    expect(prints.has(a.printId)).toBe(false);
    expect(prints.has(b.printId)).toBe(true);
  });
});

describe('printed door fronts in the scene', () => {
  const texture = new THREE.Texture({ width: 1000, height: 1500 });
  const printFor = (doorId, width, height, base) => (doorId === 'dr_left' ? printMaterial(texture, width, height, base) : null);

  it('puts the print on the front face only, with the door finish elsewhere', () => {
    const group = buildWardrobe(basic, createMaterials(catalog), { doorsVisible: true, printFor });
    const printed = door(group, 'dr_left');
    expect(Array.isArray(printed.material)).toBe(true);
    expect(printed.material[4].map).toBeTruthy(); // +z, the front face
    expect(printed.material.filter((m) => m.map)).toHaveLength(1);
    expect(Array.isArray(door(group, 'dr_middle').material)).toBe(false);
    expect(materialsOf(group).has(printed.material[0])).toBe(true); // the base material stays retained
  });

  it('builds exactly as before without prints', () => {
    const group = buildWardrobe(basic, createMaterials(catalog), { doorsVisible: true });
    expect(group.children.every((mesh) => !Array.isArray(mesh.material))).toBe(true);
  });

  it('frees the per-door print material with the wardrobe', () => {
    const group = buildWardrobe(basic, createMaterials(catalog), { doorsVisible: true, printFor });
    const print = door(group, 'dr_left').material[4];
    let disposed = 0;
    print.addEventListener('dispose', () => { disposed += 1; });
    disposeWardrobe(group);
    expect(disposed).toBe(1);
  });
});

describe('store: prints are view state only', () => {
  const meta = { printId: 'print_x', name: 'a.png', width: 10, height: 20 };

  it('never touches the design or the revision', () => {
    const store = createStore({ design: basic, revision: 2, catalog });
    const { design } = store.getState();
    store.setPrint('dr_left', meta);
    expect(store.getState().ui.prints).toEqual({ dr_left: meta });
    expect(store.getState().design).toBe(design);
    expect(store.getState().revision).toBe(2);
    store.setPrint('dr_unknown', meta); // ignored
    store.setPrint('dr_left', null);
    expect(store.getState().ui.prints).toEqual({});
  });

  it('drops prints of doors that no longer exist', () => {
    const store = createStore({ design: basic, revision: 1, catalog });
    store.setPrint('dr_left', meta);
    store.setPrint('dr_right', meta);
    store.dispatch([{ op: 'configure_doors', type: 'sliding', count: 2 }]);
    expect(store.getState().ui.prints).toEqual({});
  });

  it('keeps prints across unrelated edits', () => {
    const design = applyOps(basic, [], catalog);
    const store = createStore({ design, revision: 1, catalog });
    store.setPrint('dr_left', meta);
    store.dispatch([{ op: 'modify_shelf', id: 'shf_l1', y: 450 }]);
    expect(store.getState().ui.prints.dr_left).toEqual(meta);
  });
});
