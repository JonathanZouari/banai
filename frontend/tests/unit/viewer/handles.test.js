import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe, disposeWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { applyDoorMotion, doorPose } from '../../../src/viewer/doorMotion.js';
import { createHardware } from '../../../src/viewer/hardware.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { buildProps, disposeProps } from '../../../src/viewer/props.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const hardware = createHardware();
const build = (design, options = {}) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true, hardware, ...options });
const handlesOf = (mesh) => mesh.children.filter((c) => c.userData.part === 'handle');
const withStyle = (style) => ({ ...basic, handles: { style, finish: 'steel' } });

describe('handles and mirrors', () => {
  it('adds one handle per door and keeps the group children unchanged', () => {
    const group = build(basic);
    expect(group.children).toHaveLength(20);
    group.children.filter((m) => m.userData.kind === 'door').forEach((door) => expect(handlesOf(door)).toHaveLength(1));
  });

  it('puts each hinged-door handle on the edge opposite the hinge', () => {
    // basic wardrobe: left door hinged left, middle hinged right
    const group = build(basic);
    const handleX = (id) => handlesOf(group.children.find((m) => m.userData.componentId === id))[0].position.x;
    expect(handleX('dr_left')).toBeGreaterThan(0);
    expect(handleX('dr_middle')).toBeLessThan(0);
  });

  it('builds nothing without hardware or with style none', () => {
    const plain = buildWardrobe(basic, createMaterials(catalog), { doorsVisible: true });
    expect(plain.children.every((m) => m.children.length === 0)).toBe(true);
    const none = build(withStyle('none'));
    expect(none.children.every((m) => handlesOf(m).length === 0)).toBe(true);
  });

  it('lets a per-door handle override the root style', () => {
    const design = structuredClone(basic);
    design.doors.items[0].handle = { style: 'knob', finish: 'brass' };
    const door = build(design).children.find((m) => m.userData.componentId === 'dr_left');
    expect(handlesOf(door)[0].userData.style).toBe('knob');
  });

  it('puts drawer handles only on uncovered drawers', () => {
    const covered = build(basic).children.filter((m) => m.userData.kind === 'drawer');
    expect(covered.every((m) => handlesOf(m).length === 0)).toBe(true);
    const open = build(basic, { doorsVisible: false }).children.filter((m) => m.userData.kind === 'drawer');
    expect(open.every((m) => handlesOf(m).length === 1)).toBe(true);
  });

  it('adds a mirror only on mirror doors and nothing is a raycast hit', () => {
    const design = structuredClone(basic);
    design.doors.items[1].mirror = true;
    const group = build(design);
    const mirrors = group.children.flatMap((m) => m.children.filter((c) => c.userData.part === 'mirror'));
    expect(mirrors).toHaveLength(1);
    const ray = new THREE.Raycaster(new THREE.Vector3(1, 1, 5), new THREE.Vector3(0, 0, -1));
    group.updateMatrixWorld(true);
    const hits = group.children.flatMap((m) => ray.intersectObjects(m.children, true));
    expect(hits).toHaveLength(0);
    disposeWardrobe(group);
  });
});

describe('handles on split leaves', () => {
  // split_door: dr_middle is the left leaf (hinged left), dr_middle2 the right leaf (hinged right).
  // The compartment's door span 670..1331 mm halves at 1000.5, where the two leaves meet.
  const split = applyOps(basic, [{ op: 'split_door', id: 'dr_middle', newId: 'dr_middle2' }], catalog);
  const MEETING = 1.0005;
  const leaf = (group, id) => group.children.find((m) => m.userData.componentId === id);
  const handleWorldX = (mesh) => handlesOf(mesh)[0].getWorldPosition(new THREE.Vector3()).x;

  it('puts the handle of each leaf on the edge opposite its hinge, so both sit at the meeting line', () => {
    const group = build(split);
    group.updateMatrixWorld(true);
    const [left, right] = [leaf(group, 'dr_middle'), leaf(group, 'dr_middle2')];
    expect([left.userData.hingeSide, right.userData.hingeSide]).toEqual(['left', 'right']);
    expect(handlesOf(left)).toHaveLength(1);
    expect(handlesOf(right)).toHaveLength(1);
    expect(handlesOf(left)[0].position.x).toBeGreaterThan(0);
    expect(handlesOf(right)[0].position.x).toBeLessThan(0);
    expect(handleWorldX(left)).toBeLessThan(MEETING);
    expect(handleWorldX(right)).toBeGreaterThan(MEETING);
    expect(MEETING - handleWorldX(left)).toBeLessThan(0.06);
    expect(handleWorldX(right) - MEETING).toBeLessThan(0.06);
  });

  it('follows the hinge side in the data, not the leaf position', () => {
    const outward = applyOps(basic, [{ op: 'configure_doors', type: 'hinged', doors: [
      { id: 'dr_a', compartmentIds: ['cmp_left'], hingeSide: 'right' },
      { id: 'dr_b', compartmentIds: ['cmp_left'], hingeSide: 'left' },
      { id: 'dr_c', compartmentIds: ['cmp_middle'], hingeSide: 'left' },
      { id: 'dr_d', compartmentIds: ['cmp_right'], hingeSide: 'right' },
    ] }], catalog);
    const group = build(outward);
    expect(handlesOf(leaf(group, 'dr_a'))[0].position.x).toBeLessThan(0); // left leaf hinged right: handle on its outer edge
    expect(handlesOf(leaf(group, 'dr_b'))[0].position.x).toBeGreaterThan(0);
  });

  it('carries the handles with the leaves as they swing open', () => {
    const group = build(split);
    applyDoorMotion(group, 1);
    group.updateMatrixWorld(true);
    ['dr_middle', 'dr_middle2'].forEach((id) => {
      expect(handlesOf(leaf(group, id))[0].getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0.2);
    });
  });
});

describe('door motion', () => {
  const door = (id) => build(basic).children.find((m) => m.userData.componentId === id);

  it('is the closed pose at openness 0 and swings toward the viewer', () => {
    const left = door('dr_left');
    const closed = left.position.toArray();
    expect(doorPose(left.userData, 0).position).toEqual(closed);
    for (const id of ['dr_left', 'dr_middle']) {
      const mesh = door(id);
      const { hinge } = mesh.userData;
      const edge = new THREE.Vector3(hinge.x, mesh.position.y, hinge.z);
      const free = (m) => new THREE.Vector3(mesh.userData.hingeSide === 'left' ? 1 : -1, 0, 0).multiplyScalar(0).add(new THREE.Vector3(-(mesh.userData.hingeSide === 'left' ? -1 : 1) * mesh.geometry.parameters.width, 0, 0)).applyMatrix4(m);
      void free;
      mesh.position.fromArray(doorPose(mesh.userData, 1).position);
      mesh.rotation.y = doorPose(mesh.userData, 1).rotationY;
      mesh.updateMatrixWorld(true);
      const local = new THREE.Vector3(mesh.userData.hingeSide === 'left' ? -1 : 1, 0, -1).multiply(new THREE.Vector3(mesh.geometry.parameters.width / 2, 0, mesh.geometry.parameters.depth / 2));
      expect(mesh.localToWorld(local).distanceTo(edge)).toBeLessThan(1e-9);
      const freeEdge = mesh.localToWorld(new THREE.Vector3((mesh.userData.hingeSide === 'left' ? 1 : -1) * mesh.geometry.parameters.width / 2, 0, 0));
      expect(freeEdge.z).toBeGreaterThan(hinge.z + 0.3);
    }
  });

  it('keeps sliding panels inside the wardrobe and reports changes', () => {
    const sliding = structuredClone(basic);
    sliding.doors.type = 'sliding';
    sliding.doors.items = sliding.doors.items.slice(0, 2).map((d) => ({ ...d, hingeSide: null }));
    const group = build(sliding);
    expect(applyDoorMotion(group, 1)).toBe(true);
    expect(applyDoorMotion(group, 1)).toBe(false);
    group.children.filter((m) => m.userData.kind === 'door').forEach((m) => {
      expect(m.position.x - m.geometry.parameters.width / 2).toBeGreaterThanOrEqual(0.017);
    });
    applyDoorMotion(group, 0);
    expect(group.children.find((m) => m.userData.componentId === 'dr_middle').position.x).toBeCloseTo(m0(group), 9);
  });
});

function m0(group) {
  return group.children.find((m) => m.userData.componentId === 'dr_middle').userData.closed.position[0];
}

describe('props', () => {
  it('is deterministic, decorative-only and disposable', () => {
    const a = buildProps(basic, { seed: 7 });
    const b = buildProps(basic, { seed: 7 });
    const sig = (g) => g.children.map((c) => `${c.userData.part}${c.position.toArray().map((v) => v.toFixed(4))}`).join('|');
    expect(sig(a)).toBe(sig(b));
    expect(a.children.some((c) => c.userData.part === 'garment')).toBe(true);
    expect(a.children.some((c) => c.userData.part === 'stack')).toBe(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0.6, 1.5, 5), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObjects(a.children, true)).toHaveLength(0);
    disposeProps(a);
    disposeProps(b);
  });

  it('puts garments only where a rail exists', () => {
    const noRail = structuredClone(basic);
    noRail.compartments.forEach((c) => { c.rails = []; });
    expect(buildProps(noRail).children.some((c) => c.userData.part === 'garment')).toBe(false);
  });
});
