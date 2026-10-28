import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { applyOpening, createDoorMotion, easeInOut } from '../../../src/viewer/doorMotion.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { VISUAL } from '../../../src/viewer/units.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // dr_left hinge left, dr_middle hinge right, dr_right hinge left
const build = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true });
const doorParts = (group, id) => group.children.filter((o) => o.userData.opening && (o.userData.componentId === id
  || (!o.userData.componentId && o.userData.opening === group.children.find((m) => m.userData.componentId === id).userData.opening)));
const door = (group, id) => group.children.find((o) => o.userData.componentId === id);
const OPEN = THREE.MathUtils.degToRad(VISUAL.doorOpenAngle);

/** World x of the panel's edge on the hinge side (back face). */
function hingeEdge(panel) {
  const { hingeSide } = panel.userData;
  panel.updateMatrixWorld(true);
  panel.geometry.computeBoundingBox();
  const { min, max } = panel.geometry.boundingBox;
  const local = new THREE.Vector3(hingeSide === 'right' ? max.x : min.x, 0, min.z);
  return local.applyMatrix4(panel.matrixWorld);
}

describe('door opening (view only)', () => {
  it('tags each hinged door panel, outline and handle with the same hinge', () => {
    const group = build(basic);
    for (const id of ['dr_left', 'dr_middle', 'dr_right']) {
      const parts = doorParts(group, id);
      expect(parts).toHaveLength(3); // panel, outline, handle
      expect(parts[0].userData.opening.type).toBe('hinge');
    }
    expect(door(group, 'dr_left').userData.opening.sign).toBe(-1);
    expect(door(group, 'dr_middle').userData.opening.sign).toBe(1);
  });

  it('keeps the hinge edge fixed and swings the door outward', () => {
    const group = build(basic);
    for (const id of ['dr_left', 'dr_middle']) {
      const panel = door(group, id);
      const closedEdge = hingeEdge(panel);
      const closedZ = panel.position.z;
      applyOpening(panel, 1);
      const openEdge = hingeEdge(panel);
      expect(openEdge.x).toBeCloseTo(closedEdge.x, 6);
      expect(openEdge.z).toBeCloseTo(closedEdge.z, 6);
      expect(panel.position.z).toBeGreaterThan(closedZ + 0.2); // outward, toward the viewer
      expect(Math.abs(panel.rotation.y)).toBeCloseTo(OPEN, 6);
    }
    expect(door(group, 'dr_left').rotation.y).toBeLessThan(0); // left and right hinges mirror
    expect(door(group, 'dr_middle').rotation.y).toBeGreaterThan(0);
  });

  it('returns exactly to the closed transform at amount 0', () => {
    const panel = door(build(basic), 'dr_left');
    const closed = panel.position.clone();
    applyOpening(panel, 1);
    applyOpening(panel, 0.37);
    applyOpening(panel, 0);
    expect(panel.position.equals(closed)).toBe(true);
    expect(panel.rotation.y).toBeCloseTo(0, 12);
  });

  it('slides sliding panels over the first one', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b', 'dr_c'] }], catalog);
    const group = build(sliding);
    const [a, b, c] = ['dr_a', 'dr_b', 'dr_c'].map((id) => door(group, id));
    const firstX = a.position.x;
    [a, b, c].forEach((panel) => applyOpening(panel, 1));
    expect(b.position.x).toBeCloseTo(firstX, 6);
    expect(c.position.x).toBeCloseTo(firstX, 6);
    expect(c.position.z).not.toBeCloseTo(a.position.z, 6); // same track, nudged so faces never coincide
    expect(a.rotation.y).toBe(0);
  });

  it('animates with easing, and jumps when reduced motion is preferred', () => {
    const group = build(basic);
    const motion = createDoorMotion({ duration: 400 });
    motion.attach(group);
    motion.setOpen(true);
    expect(motion.step(200)).toBe(true);
    expect(motion.amount()).toBeCloseTo(0.5, 6);
    motion.step(1000);
    expect(motion.isSettled()).toBe(true);
    expect(Math.abs(door(group, 'dr_left').rotation.y)).toBeCloseTo(OPEN, 6);

    // A rebuilt group (design change) takes the current position at once.
    const rebuilt = build(basic);
    motion.attach(rebuilt);
    expect(Math.abs(door(rebuilt, 'dr_left').rotation.y)).toBeCloseTo(OPEN, 6);

    const instant = createDoorMotion({ reducedMotion: () => true });
    instant.attach(build(basic));
    instant.setOpen(true);
    expect(instant.isSettled()).toBe(true);
    expect(instant.amount()).toBe(1);
    expect([easeInOut(0), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.5, 1]);
  });
});

describe('store: doors open is view state only', () => {
  const makeStore = () => createStore({ design: basic, revision: 4, catalog });

  it('never changes the design or the revision', () => {
    const store = makeStore();
    const { design } = store.getState();
    store.setDoorsOpen(true);
    expect(store.getState().ui.doorsOpen).toBe(true);
    expect(store.getState().design).toBe(design);
    expect(store.getState().revision).toBe(4);
  });

  it('keeps open doors visible when an interior part is selected', () => {
    const store = makeStore();
    store.setDoorsOpen(true);
    store.select('shf_l2');
    expect(store.getState().ui.doorsVisible).toBe(true);
    const closed = makeStore();
    closed.select('shf_l2');
    expect(closed.getState().ui.doorsVisible).toBe(false); // unchanged behaviour with closed doors
  });
});
