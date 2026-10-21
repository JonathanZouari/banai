import { describe, expect, it } from 'vitest';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { createOpener, HINGE_OPEN_RAD } from '../../../src/viewer/openState.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true });
const withDoors = (group, id) => group.children.filter((mesh) => (mesh.userData.doorId ?? mesh.userData.componentId) === id);
const panelOf = (group, id) => group.children.find((mesh) => mesh.userData.componentId === id);
const finish = (opener) => opener.step(10);

describe('createOpener', () => {
  it('swings a hinged door around its hinge edge and moves its handle and outline with it', () => {
    const group = build(basic);
    const opener = createOpener();
    opener.attach(group, basic);
    const [door] = basic.doors.items;
    const panel = panelOf(group, door.id);
    const parts = withDoors(group, door.id);
    expect(parts).toHaveLength(3);
    const before = parts.map((mesh) => mesh.position.clone());

    expect(opener.toggle(door.id)).toBe(true);
    finish(opener);
    expect(Math.abs(panel.rotation.y)).toBeCloseTo(HINGE_OPEN_RAD, 6);
    parts.forEach((mesh, i) => expect(mesh.position.distanceTo(before[i])).toBeGreaterThan(0.01));
    // A door opens toward the viewer (+z).
    expect(panel.position.z).toBeGreaterThan(before[0].z);

    opener.toggle(door.id);
    finish(opener);
    parts.forEach((mesh, i) => expect(mesh.position.distanceTo(before[i])).toBeCloseTo(0, 6));
    expect(panel.rotation.y).toBeCloseTo(0, 6);
  });

  it('pulls a drawer toward the viewer', () => {
    const group = build(basic);
    const opener = createOpener();
    opener.attach(group, basic);
    const drawerId = basic.compartments.flatMap((c) => c.drawers)[0].id;
    const drawer = panelOf(group, drawerId);
    const z = drawer.position.z;
    opener.toggle(drawerId);
    finish(opener);
    expect(drawer.position.z).toBeGreaterThan(z + 0.1);
    expect(opener.isOpen(drawerId)).toBe(true);
  });

  it('ignores components that cannot open and keeps the open state across a rebuild', () => {
    const group = build(basic);
    const opener = createOpener();
    opener.attach(group, basic);
    expect(opener.toggle('shf_l1')).toBe(false);
    const [door] = basic.doors.items;
    opener.toggle(door.id);
    finish(opener);

    const rebuilt = build(basic);
    opener.attach(rebuilt, basic);
    expect(Math.abs(panelOf(rebuilt, door.id).rotation.y)).toBeCloseTo(HINGE_OPEN_RAD, 6);
  });

  it('closeAll animates every open door shut', () => {
    const group = build(basic);
    const opener = createOpener();
    opener.attach(group, basic);
    basic.doors.items.forEach((door) => opener.toggle(door.id));
    finish(opener);
    opener.closeAll();
    finish(opener);
    basic.doors.items.forEach((door) => expect(panelOf(group, door.id).rotation.y).toBeCloseTo(0, 6));
  });
});
