import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { poseDoors } from '../../../src/viewer/builders/doors.js';
import { createMaterials, surfaceOf } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design, options = {}) => buildWardrobe(design, createMaterials(catalog), options);
const meshes = (group) => group.children.filter((child) => child.isMesh);
const byId = (group, id) => meshes(group).filter((mesh) => mesh.userData.componentId === id);
const size = (mesh) => {
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getSize(new THREE.Vector3());
};
const close = (actual, expected) => expect(actual).toBeCloseTo(expected, 6);

describe('buildWardrobe', () => {
  it('creates one mesh per component, tagged with id and kind', () => {
    const group = build(basic);
    const kinds = meshes(group).reduce((counts, m) => ({ ...counts, [m.userData.kind]: (counts[m.userData.kind] ?? 0) + 1 }), {});
    expect(kinds).toEqual({ carcass: 5, partition: 2, shelf: 7, drawer: 2, rail: 1, door: 3, hardware: 3, pull: 2 });
    expect(byId(group, 'shf_l1')).toHaveLength(1);
    expect(byId(group, 'carcass')).toHaveLength(5);
  });

  it('places carcass panels from the design dimensions (mm -> m)', () => {
    const [left] = meshes(build(basic)).filter((m) => m.userData.part === 'left');
    close(left.position.x, 0.009);
    close(left.position.y, 1.2);
    close(left.position.z, -0.3);
    const dims = size(left);
    close(dims.x, 0.018);
    close(dims.y, 2.4);
    close(dims.z, 0.6);
  });

  it('places a shelf inside its compartment at its height', () => {
    const [shelf] = byId(build(basic), 'shf_l1');
    close(shelf.position.x, (18 + 643 / 2) / 1000);
    close(shelf.position.y, (18 + 400 + 9) / 1000);
    close(size(shelf).x, 0.643);
    close(size(shelf).y, 0.018);
  });

  it('places partitions between compartments', () => {
    const [partition] = byId(build(basic), 'prt_1');
    close(partition.position.x, (18 + 643 + 9) / 1000);
    close(size(partition).y, 2.364);
  });

  it('follows state changes: moving a shelf moves its mesh', () => {
    const moved = applyOps(basic, [{ op: 'modify_shelf', id: 'shf_l1', y: 1000 }], catalog);
    const [shelf] = byId(build(moved), 'shf_l1');
    close(shelf.position.y, (18 + 1000 + 9) / 1000);
  });

  it('builds the doors closed by default', () => {
    const [door] = byId(build(basic), 'dr_left');
    close(door.rotation.y, 0);
    close(door.position.z, 0.009);
  });

  it('spans hinged doors over their compartments and splits sliding doors evenly', () => {
    const hinged = applyOps(basic, [{ op: 'configure_doors', type: 'hinged',
      doors: [{ id: 'dr_wide', compartmentIds: ['cmp_left', 'cmp_middle'], hingeSide: 'left' }] }], catalog);
    const [wide] = byId(build(hinged), 'dr_wide');
    expect(size(wide).x).toBeGreaterThan(1.29);

    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] }], catalog);
    const [a, b] = [...byId(build(sliding), 'dr_a'), ...byId(build(sliding), 'dr_b')];
    close(size(a).x, size(b).x);
    expect(a.position.z).not.toBeCloseTo(b.position.z, 3);
  });

  it('opens hinged doors about their hinge edge, with the handle, and closes them again', () => {
    const group = build(basic);
    const [left] = byId(group, 'dr_left'); // hinged left, nothing else on that hinge
    const [middle] = byId(group, 'dr_middle'); // hinged right, shares its partition with dr_right
    const closed = left.position.clone();
    const handle = meshes(group).find((m) => m.userData.part === 'handle' && Math.abs(m.position.x - left.position.x) < 0.33);
    const handleClosed = handle.position.clone();

    poseDoors(group, 1);
    expect(THREE.MathUtils.radToDeg(left.rotation.y)).toBeCloseTo(-100, 6);
    expect(THREE.MathUtils.radToDeg(middle.rotation.y)).toBeCloseTo(90, 6); // stops side by side, never crossing
    expect(left.position.z).toBeGreaterThan(0.2); // the free edge came forward
    expect(left.position.x).toBeLessThan(closed.x); // and swung toward the hinge side
    expect(handle.position.z).toBeGreaterThan(handleClosed.z); // the handle travels with its door

    poseDoors(group, 0);
    close(left.rotation.y, 0);
    close(left.position.x, closed.x);
    close(left.position.z, closed.z);
    close(handle.position.z, handleClosed.z);
  });

  it('builds open doors directly when asked (interior view)', () => {
    const [left] = byId(build(basic, { doorsOpen: 1 }), 'dr_left');
    expect(left.rotation.y).toBeLessThan(-1.5);
  });

  it('turns sliding panels translucent when open, hiding their handles, without touching shared materials', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] }], catalog);
    const materials = createMaterials(catalog);
    const group = buildWardrobe(sliding, materials, { doorsOpen: 1 });
    const [a] = byId(group, 'dr_a');
    expect(a.material.opacity).toBeCloseTo(0.3);
    expect(a.material).not.toBe(materials.forAppearance(sliding.doors.appearance));
    expect(materials.forAppearance(sliding.doors.appearance).transparent).toBe(false);
    expect(meshes(group).filter((m) => m.userData.part === 'handle').every((m) => !m.visible)).toBe(true);
    poseDoors(group, 0);
    expect(a.material.opacity).toBe(1);
  });

  it('gives each drawer a pull that clicks pass through', () => {
    const group = build(basic);
    const pulls = meshes(group).filter((m) => m.userData.kind === 'pull');
    expect(pulls).toHaveLength(2);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    pulls.forEach((m) => {
      expect(m.userData.componentId).toBeUndefined();
      expect(raycaster.intersectObject(m)).toEqual([]);
    });
  });

  it('casts and receives shadows on wardrobe parts', () => {
    const [shelf] = byId(build(basic), 'shf_l1');
    expect(shelf.castShadow).toBe(true);
    expect(shelf.receiveShadow).toBe(true);
  });

  it('puts each hinged-door handle on the edge opposite the hinge', () => {
    const group = build(basic);
    const doorOf = (id) => byId(group, id)[0];
    const handles = meshes(group).filter((m) => m.userData.part === 'handle');
    const handleNear = (door) => handles.find((h) => Math.abs(h.position.x - door.position.x) < size(door).x / 2);
    // basic wardrobe: left door hinged left, middle hinged right, right hinged left
    const left = doorOf('dr_left');
    const middle = doorOf('dr_middle');
    expect(handleNear(left).position.x).toBeGreaterThan(left.position.x);
    expect(handleNear(middle).position.x).toBeLessThan(middle.position.x);
  });

  it('overlaps sliding panels, spans the full interior and adds two rails and a handle per panel', () => {
    const three = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b', 'dr_c'] }], catalog);
    const group = build(three);
    const panels = ['dr_a', 'dr_b', 'dr_c'].map((id) => byId(group, id)[0]);
    const left = (m) => m.position.x - size(m).x / 2;
    const right = (m) => m.position.x + size(m).x / 2;
    close(left(panels[0]), 0.018);
    close(right(panels[2]), 2 - 0.018);
    expect(right(panels[0])).toBeGreaterThan(left(panels[1]));
    expect(right(panels[1])).toBeGreaterThan(left(panels[2]));
    expect(panels[0].position.z).toBeCloseTo(panels[2].position.z, 6);
    expect(panels[1].position.z).toBeGreaterThan(panels[0].position.z);
    const parts = meshes(group).filter((m) => m.userData.kind === 'hardware').map((m) => m.userData.part).sort();
    expect(parts).toEqual(['handle', 'handle', 'handle', 'rail-bottom', 'rail-top']);
  });

  it('keeps hardware out of the way of clicks and selection', () => {
    const group = build(basic);
    const hardwareMeshes = meshes(group).filter((m) => m.userData.kind === 'hardware');
    expect(hardwareMeshes.length).toBeGreaterThan(0);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    hardwareMeshes.forEach((m) => {
      expect(m.userData.componentId).toBeUndefined();
      expect(raycaster.intersectObject(m)).toEqual([]);
    });
  });

  it('draws a single sliding door without overlap and no doors for type none', () => {
    const one = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 1 }], catalog);
    const [panel] = meshes(build(one)).filter((m) => m.userData.kind === 'door');
    close(size(panel).x, 2 - 0.036);
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(meshes(build(none)).some((m) => ['door', 'hardware'].includes(m.userData.kind))).toBe(false);
  });

  it('maps appearance to material colour and finish roughness', () => {
    const custom = applyOps(basic, [
      { op: 'set_material', target: 'carcass', color: { custom: true, name: 'Sage', hex: '#9caf88' }, finish: { catalogId: 'gloss' } },
    ], catalog);
    const [left] = meshes(build(custom)).filter((m) => m.userData.part === 'left');
    expect(left.material.color.getHexString()).toBe('9caf88');
    expect(left.material.roughness).toBeCloseTo(0.15);
    const [shelf] = byId(build(basic), 'shf_l1');
    expect(shelf.material.color.getHexString()).toBe('f2f1ed');
  });

  it('draws the catalog material: wood grain, lacquer clear coat, or plain board', () => {
    const appearance = (material, color) => ({ material: { catalogId: material }, color: { catalogId: color }, finish: { catalogId: 'matte' } });
    expect(surfaceOf(appearance('oak_veneer', 'white'))).toBe('wood');
    expect(surfaceOf(appearance('melamine', 'walnut'))).toBe('wood');
    expect(surfaceOf(appearance('lacquered_mdf', 'white'))).toBe('lacquer');
    expect(surfaceOf(appearance('melamine', 'white'))).toBe('board');
    const lacquer = createMaterials(catalog).forAppearance(appearance('lacquered_mdf', 'white'));
    expect(lacquer.clearcoat).toBe(1);
    expect(lacquer.roughness).toBeCloseTo(0.85); // the base keeps its finish under the coat
  });

  it('reuses one material per distinct appearance', () => {
    const group = build(basic);
    const shelfMaterials = new Set(meshes(group).filter((m) => m.userData.kind === 'shelf').map((m) => m.material));
    expect(shelfMaterials.size).toBe(1);
  });
});

describe('material cache', () => {
  it('disposes materials that are no longer in use', () => {
    const materials = createMaterials(catalog);
    const custom = { material: { catalogId: 'melamine' }, color: { custom: true, name: 'a', hex: '#111111' }, finish: { catalogId: 'matte' } };
    const first = materials.forAppearance(custom);
    const kept = materials.forAppearance(basic.carcass.appearance);
    materials.retainOnly(new Set([kept]));
    expect(materials.forAppearance(custom)).not.toBe(first);
    expect(materials.forAppearance(basic.carcass.appearance)).toBe(kept);
  });
});

describe('door shelves', () => {
  const withShelves = applyOps(basic, [
    { op: 'add_door_shelf', doorId: 'dr_left', y: 1000, depth: 120, id: 'dsh_1' },
  ], catalog);

  it('hang a board and a guard lip on the inside face of the closed door', () => {
    const parts = byId(build(withShelves), 'dsh_1');
    expect(parts.map((m) => m.userData.kind)).toEqual(['doorShelf', 'doorShelf']);
    const [board] = parts;
    close(board.position.y, (18 + 1000 + 6) / 1000);
    close(board.position.z, -0.06);
    close(size(board).z, 0.12);
  });

  it('swing open with their door', () => {
    const group = build(withShelves);
    const [board] = byId(group, 'dsh_1');
    const closedZ = board.position.z;
    poseDoors(group, 1);
    expect(board.rotation.y).toBeCloseTo(byId(group, 'dr_left')[0].rotation.y, 6);
    expect(board.position.z).toBeGreaterThan(closedZ);
  });

  it('set the shelves and drawers behind that door back to clear them; other compartments keep full depth', () => {
    const group = build(withShelves);
    const [left] = byId(group, 'shf_l1');
    const [right] = byId(group, 'shf_r1');
    close(size(left).z, (594 - 122) / 1000);
    close(left.position.z, -(594 + 122) / 2000);
    close(size(right).z, 0.594);
  });
});
