import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design, options = { doorsVisible: true }) => buildWardrobe(design, createMaterials(catalog), options);
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
    expect(kinds).toEqual({ carcass: 5, partition: 2, shelf: 7, drawer: 2, rail: 1, door: 3, hardware: 3 });
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

  it('hides doors when requested', () => {
    const group = build(basic, { doorsVisible: false });
    expect(meshes(group).some((m) => m.userData.kind === 'door')).toBe(false);
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

  it('hides door hardware together with the doors', () => {
    const group = build(basic, { doorsVisible: false });
    expect(meshes(group).some((m) => m.userData.kind === 'hardware')).toBe(false);
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

describe('door handles and mirror fronts', () => {
  const handlesOf = (group) => meshes(group).filter((m) => m.userData.part === 'handle');
  const withHandles = (design, style, finish) => applyOps(design, [{ op: 'set_handles', style, ...(finish ? { finish } : {}) }], catalog);

  it('draws one handle per door in each style, and none for style none', () => {
    const lengths = {};
    for (const style of ['bar', 'long_bar', 'knob', 'edge_pull']) {
      const found = handlesOf(build(withHandles(basic, style)));
      expect(found).toHaveLength(3);
      found.forEach((h) => expect(h.userData.style).toBe(style));
      lengths[style] = size(found[0]).y;
    }
    expect(lengths.long_bar).toBeGreaterThan(lengths.bar);
    expect(lengths.edge_pull).toBeLessThan(lengths.bar);
    expect(handlesOf(build(withHandles(basic, 'none')))).toHaveLength(0);
    const sliding = applyOps(withHandles(basic, 'none'), [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    const parts = meshes(build(sliding)).filter((m) => m.userData.kind === 'hardware').map((m) => m.userData.part).sort();
    expect(parts).toEqual(['rail-bottom', 'rail-top']); // the sliding rails stay
  });

  it('puts an edge pull right at the free edge, closer than a bar', () => {
    const door = (group) => byId(group, 'dr_left')[0];
    const gapToEdge = (group) => {
      const right = door(group).position.x + size(door(group)).x / 2;
      const h = handlesOf(group).find((m) => Math.abs(m.position.x - door(group).position.x) < size(door(group)).x / 2);
      return right - h.position.x;
    };
    expect(gapToEdge(build(withHandles(basic, 'edge_pull')))).toBeLessThan(gapToEdge(build(basic)));
  });

  it('colours handles by finish from the catalog', () => {
    const brass = handlesOf(build(withHandles(basic, 'bar', 'brass')))[0];
    expect(brass.material.color.getHexString()).toBe('b8945a');
    expect(brass.material.metalness).toBeCloseTo(0.85);
  });

  it('adds a selectable mirror pane only to mirror doors, hinged and sliding', () => {
    const hinged = applyOps(basic, [{ op: 'modify_door', id: 'dr_middle', front: 'mirror' }], catalog);
    const group = build(hinged);
    const panes = meshes(group).filter((m) => m.userData.kind === 'mirror');
    expect(panes.map((m) => m.userData.componentId)).toEqual(['dr_middle']);
    const [door] = byId(group, 'dr_middle');
    expect(size(panes[0]).x).toBeLessThan(size(door).x);
    expect(panes[0].position.z).toBeGreaterThan(door.position.z);
    expect(panes[0].material.metalness).toBe(1);
    panes[0].updateMatrixWorld();
    const raycaster = new THREE.Raycaster(new THREE.Vector3(panes[0].position.x, panes[0].position.y, 5), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(panes[0]).length).toBeGreaterThan(0); // clicking the mirror selects its door
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] }, { op: 'modify_door', id: 'dr_b', front: 'mirror' }], catalog);
    expect(meshes(build(sliding)).filter((m) => m.userData.kind === 'mirror').map((m) => m.userData.componentId)).toEqual(['dr_b']);
  });
});
