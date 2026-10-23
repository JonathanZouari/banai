import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { MAX_OPEN_ANGLE, applyDoorSwing, hasHingedDoors } from '../../../src/viewer/swing.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true });
const doorMesh = (group, id) => group.children.find((child) => child.isMesh && child.userData.componentId === id);

describe('door swing', () => {
  it('only applies to hinged doors', () => {
    expect(hasHingedDoors(basic)).toBe(true);
    expect(hasHingedDoors(applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog))).toBe(false);
  });

  it('leaves a closed door exactly where it was built', () => {
    const group = build(basic);
    const before = doorMesh(group, 'dr_left').position.clone();
    applyDoorSwing(group, 0);
    expect(doorMesh(group, 'dr_left').position.toArray()).toEqual(before.toArray());
    expect(doorMesh(group, 'dr_left').rotation.y).toBeCloseTo(0, 9);
  });

  it('swings a left-hinged door out towards the viewer, keeping its hinge edge in place', () => {
    const group = build(basic);
    const door = doorMesh(group, 'dr_left');
    expect(door.userData.hingeSide).toBe('left');
    const { pivotX } = door.userData.swing;
    applyDoorSwing(group, 1);
    expect(door.rotation.y).toBeCloseTo(-MAX_OPEN_ANGLE, 6);
    // The panel's free edge now points out of the front (z > 0) and the hinge edge has not moved.
    door.updateMatrixWorld(true);
    const half = door.geometry.parameters.width / 2;
    const hinge = door.localToWorld(door.position.clone().set(-half, 0, 0));
    const free = door.localToWorld(door.position.clone().set(half, 0, 0));
    expect(hinge.x).toBeCloseTo(pivotX, 6);
    expect(free.z).toBeGreaterThan(door.geometry.parameters.width * 0.9);
  });

  it('swings a right-hinged door the other way, also out of the front', () => {
    const group = build(basic);
    const door = group.children.find((child) => child.isMesh && child.userData.hingeSide === 'right');
    applyDoorSwing(group, 1);
    expect(door.rotation.y).toBeCloseTo(MAX_OPEN_ANGLE, 6);
    door.updateMatrixWorld(true);
    const half = door.geometry.parameters.width / 2;
    const free = door.localToWorld(door.position.clone().set(-half, 0, 0));
    expect(free.z).toBeGreaterThan(door.geometry.parameters.width * 0.9);
  });

  it('moves the handle and outline with the door, and returns exactly when closed again', () => {
    const group = build(basic);
    const rest = group.children.filter((child) => child.userData.swing).map((child) => child.position.toArray());
    applyDoorSwing(group, 0.6);
    const mid = group.children.filter((child) => child.userData.swing).map((child) => child.position.toArray());
    expect(mid).not.toEqual(rest);
    applyDoorSwing(group, 0);
    const back = group.children.filter((child) => child.userData.swing).map((child) => child.position.toArray());
    back.flat().forEach((value, index) => expect(value).toBeCloseTo(rest.flat()[index], 9));
  });

  it('clamps the progress to the closed..open range', () => {
    const group = build(basic);
    applyDoorSwing(group, 7);
    expect(Math.abs(doorMesh(group, 'dr_left').rotation.y)).toBeCloseTo(MAX_OPEN_ANGLE, 6);
    applyDoorSwing(group, -3);
    expect(doorMesh(group, 'dr_left').rotation.y).toBeCloseTo(0, 9);
  });
});
