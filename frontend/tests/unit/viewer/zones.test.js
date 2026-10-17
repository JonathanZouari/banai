// Zones (docs/schema.md "Zones"): dividers (fixed shelves) split a compartment, and a hinged door
// anchored to them covers one zone. Expected numbers are worked out by hand for the basic wardrobe:
//   W 2000, H 2400, panel 18, no plinth (interior y 0 is 18 mm above the floor)
//   cmp_left x 18..661, its door span 0..670 (the outer edge to the middle of prt_1)
//   cmp_right x 1340..1982, its door span 1331..2000
// A door edge on a divider is the divider's centre line, y + thickness / 2 above the interior floor,
// and each edge is inset 1.5 mm (the 3 mm joint). The zone fields are set by hand (not via ops).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { hingedDoorRects, hingedDoorSpan } from '../../../src/viewer/builders/doors.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import { selectionAnchor } from '../../../src/viewer/dimensions.js';
import { applyDoorMotion } from '../../../src/viewer/doorMotion.js';
import { resolveFlashTargets } from '../../../src/viewer/flash.js';
import { describeSelection, doorZone } from '../../../src/viewer/format.js';
import { createHighlighter } from '../../../src/viewer/highlight.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';
import { threeZones, zonePair } from './zoneDesigns.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design, options = { doorsVisible: true }) => buildWardrobe(design, createMaterials(catalog), options);
const rectMm = (r) => [r.x0, r.x0 + r.width, r.y0, r.y0 + r.height];
const mm = (v) => Math.round(v * 1e4) / 10 + 0; // m -> mm, to 0.1 mm (+ 0 turns -0 into 0)
const meshOf = (group, id) => group.children.find((m) => m.userData.componentId === id);
const boxMm = (object) => {
  const box = new THREE.Box3().setFromObject(object);
  return { x: [mm(box.min.x), mm(box.max.x)], y: [mm(box.min.y), mm(box.max.y)], z: [mm(box.min.z), mm(box.max.z)] };
};

const rectsOf = (design) => Object.fromEntries(hingedDoorRects(design, frameOf(design)).map((r) => [r.door.id, r]));

describe('zone doors', () => {
  it('spans each door between the centre lines of its dividers, a compartment split into 3 zones', () => {
    // Divider centre lines: shf_l2 18 + 800 + 9 = 827, shf_l4 18 + 1600 + 9 = 1627 above the floor.
    // zone 1: 0 (floor, no plinth) .. 827 -> y0 1.5, height 824
    // zone 2: 827 .. 1627 -> y0 828.5, height 797
    // zone 3: 1627 .. 2400 (carcass top) -> y0 1628.5, height 770
    // Across: the compartment's full door span 0..670 -> x0 1.5, width 667.
    const rects = rectsOf(threeZones);
    expect(rectMm(rects.dr_l_z1)).toEqual([1.5, 668.5, 1.5, 825.5]);
    expect(rectMm(rects.dr_l_z2)).toEqual([1.5, 668.5, 828.5, 1625.5]);
    expect(rectMm(rects.dr_l_z3)).toEqual([1.5, 668.5, 1628.5, 2398.5]);
    expect([rects.dr_l_z1, rects.dr_l_z2, rects.dr_l_z3].map((r) => r.height)).toEqual([824, 797, 770]);
    expect([rects.dr_l_z1, rects.dr_l_z2, rects.dr_l_z3].map((r) => r.leaf)).toEqual([null, null, null]);
    // The joint between two zone doors is 3 mm, centred on the divider.
    expect(rects.dr_l_z2.y0 - (rects.dr_l_z1.y0 + rects.dr_l_z1.height)).toBe(3);
    expect((rects.dr_l_z2.y0 + rects.dr_l_z1.y0 + rects.dr_l_z1.height) / 2).toBe(827);
    // A full-height door is unchanged: 1.5 .. 2398.5.
    expect(rectMm(rects.dr_middle)).toEqual([671.5, 1329.5, 1.5, 2398.5]);
  });

  it('draws the door meshes on those rectangles', () => {
    const group = build(threeZones);
    expect(boxMm(meshOf(group, 'dr_l_z2'))).toEqual({ x: [1.5, 668.5], y: [828.5, 1625.5], z: [0, 18] });
    expect(boxMm(meshOf(group, 'dr_l_z3')).y).toEqual([1628.5, 2398.5]);
  });

  it('puts the plinth under an unanchored bottom edge only', () => {
    const raised = structuredClone(threeZones);
    raised.carcass.plinthHeight = 100; // dividers move up with the interior: 100 + 18 + 800 + 9 = 927
    const rects = rectsOf(raised);
    expect(rectMm(rects.dr_l_z1)).toEqual([1.5, 668.5, 101.5, 925.5]);
    expect(rectMm(rects.dr_l_z2)).toEqual([1.5, 668.5, 928.5, 1725.5]);
    expect(rectMm(rects.dr_l_z3)).toEqual([1.5, 668.5, 1728.5, 2398.5]);
  });

  it('splits a zone into a pair without touching the other zones', () => {
    // dr_l_z2 / dr_l_z2r share their anchors: a split pair over 0..670, halved at 335.
    const rects = rectsOf(zonePair);
    expect(rectMm(rects.dr_l_z2)).toEqual([1.5, 333.5, 828.5, 1625.5]); // width 335 - 3 = 332
    expect(rectMm(rects.dr_l_z2r)).toEqual([336.5, 668.5, 828.5, 1625.5]);
    expect([rects.dr_l_z2.leaf, rects.dr_l_z2r.leaf]).toEqual(['left', 'right']);
    // Four leaves on the compartment, but only the two in zone 2 pair up.
    expect(rectMm(rects.dr_l_z1)).toEqual([1.5, 668.5, 1.5, 825.5]);
    expect(rectMm(rects.dr_l_z3)).toEqual([1.5, 668.5, 1628.5, 2398.5]);
    expect([rects.dr_l_z1.leaf, rects.dr_l_z3.leaf]).toEqual([null, null]);
  });

  it('lays out a mixed column: a door, an open zone and a pair', () => {
    // cmp_right dividers: shf_r1 centre 18 + 800 + 9 = 827, shf_r2 18 + 1400 + 9 = 1427.
    // zone 1 door 0..827; zone 2 (827..1427) open; zone 3 pair 1427..2400, halved at (1331 + 2000) / 2 = 1665.5.
    const rects = rectsOf(threeZones);
    expect(rectMm(rects.dr_r_z1)).toEqual([1332.5, 1998.5, 1.5, 825.5]); // x0 1331 + 1.5, width 669 - 3
    expect(rectMm(rects.dr_r_z3)).toEqual([1332.5, 1664, 1428.5, 2398.5]); // width 334.5 - 3 = 331.5
    expect(rectMm(rects.dr_r_z3r)).toEqual([1667, 1998.5, 1428.5, 2398.5]);
    expect([rects.dr_r_z1.leaf, rects.dr_r_z3.leaf, rects.dr_r_z3r.leaf]).toEqual([null, 'left', 'right']);
    // Nothing covers zone 2: no door overlaps 827..1427.
    const cover = Object.values(rects).filter((r) => r.door.compartmentIds[0] === 'cmp_right' && r.y0 < 1427 && r.y0 + r.height > 827);
    expect(cover).toEqual([]);
  });

  it('reads missing or null anchors as a full-height door and skips stale ones', () => {
    const frame = frameOf(basic);
    expect(hingedDoorSpan(basic, frame, basic.doors.items[0])).toEqual([0, 2400]);
    expect(hingedDoorSpan(basic, frame, { ...basic.doors.items[0], bottomShelfId: null, topShelfId: null })).toEqual([0, 2400]);
    const stale = structuredClone(threeZones);
    stale.doors.items[1].topShelfId = 'shf_gone';
    expect(rectsOf(stale).dr_l_z2).toBeUndefined();
    const upsideDown = structuredClone(threeZones);
    Object.assign(upsideDown.doors.items[1], { bottomShelfId: 'shf_l4', topShelfId: 'shf_l2' });
    expect(rectsOf(upsideDown).dr_l_z2).toBeUndefined();
  });
});

describe('zone doors in the scene', () => {
  const group = build(zonePair);
  group.updateMatrixWorld(true);

  it('swings each zone door about its own hinge, at its own height', () => {
    const swung = build(zonePair);
    applyDoorMotion(swung, 1);
    swung.updateMatrixWorld(true);
    const z2 = meshOf(swung, 'dr_l_z2');
    expect(z2.rotation.y).toBeLessThan(-1); // hinged left: swings by -100 degrees
    expect(meshOf(swung, 'dr_l_z2r').rotation.y).toBeGreaterThan(1);
    expect(boxMm(z2).y).toEqual([828.5, 1625.5]); // the height does not change
    expect(boxMm(z2).z[1]).toBeGreaterThan(300); // the free edge comes toward the viewer
    expect(meshOf(swung, 'dr_l_z2').userData.hinge.x).toBeCloseTo(0.0015, 9);
    expect(meshOf(swung, 'dr_l_z2r').userData.hinge.x).toBeCloseTo(0.6685, 9);
  });

  it('picks, highlights, flashes and labels a single zone door', () => {
    const ray = new THREE.Raycaster(new THREE.Vector3(0.2, 1.2, 1), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObjects(group.children, false)[0].object.userData.componentId).toBe('dr_l_z2');
    ray.set(new THREE.Vector3(0.2, 2.0, 1), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObjects(group.children, false)[0].object.userData.componentId).toBe('dr_l_z3');

    const scene = new THREE.Scene();
    const highlighter = createHighlighter(scene);
    highlighter.update(group, zonePair, { id: 'dr_l_z2r', kind: 'door' });
    const outlines = scene.getObjectByName('highlight').children.filter((c) => c.isLineSegments);
    expect(outlines).toHaveLength(1);
    expect(mm(outlines[0].position.y)).toBe(1227); // (828.5 + 1625.5) / 2
    highlighter.dispose();

    const [{ box }] = resolveFlashTargets(['door:dr_l_z3'], zonePair, group);
    expect([mm(box.min.y), mm(box.max.y)]).toEqual([1628.5, 2398.5]);
    const [{ box: fromLayout }] = resolveFlashTargets(['door:dr_r_z1'], zonePair); // no group: the layout rectangle
    expect([mm(fromLayout.min.y), mm(fromLayout.max.y)]).toEqual([1.5, 825.5]);

    expect(mm(selectionAnchor(group, zonePair, { id: 'dr_l_z1', kind: 'door' }).y)).toBe(413.5);
    expect(describeSelection(zonePair, { id: 'dr_l_z2r', kind: 'door' })).toBe('דלת ציר · ציר ימני · אזור 2');
    expect(describeSelection(zonePair, { id: 'dr_r_z3', kind: 'door' })).toBe('דלת ציר · ציר שמאלי · אזור 3');
    expect(describeSelection(zonePair, { id: 'dr_middle', kind: 'door' })).toBe('דלת ציר · ציר ימני');
    expect(doorZone(zonePair, zonePair.doors.items[0])).toBe(1);
  });
});

describe('dividers (fixed shelves)', () => {
  const zRange = (group, id) => boxMm(meshOf(group, id)).z;

  it('reach the front like the partitions, while regular shelves stay set back (hinged)', () => {
    const group = build(threeZones);
    expect(zRange(group, 'shf_l2')).toEqual([-594, 0]); // divider: back panel .. carcass front
    expect(zRange(group, 'prt_1')).toEqual([-594, 0]);
    expect(zRange(group, 'shf_l1')).toEqual([-594, -25]); // regular: 25 mm behind the front
    expect(meshOf(group, 'shf_l2').userData).toEqual({ componentId: 'shf_l2', kind: 'shelf', compartmentId: 'cmp_left', fixed: true });
    expect(meshOf(group, 'shf_l1').userData.fixed).toBeUndefined();
    expect(boxMm(meshOf(group, 'shf_l2')).y).toEqual([818, 836]); // same height as before: 18 + 800 .. + 18
  });

  it('stop behind the sliding tracks, flush with the partitions', () => {
    const sliding = structuredClone(threeZones);
    sliding.doors = { ...sliding.doors, type: 'sliding', items: ['dr_a', 'dr_b'].map((id) => ({ id, compartmentIds: [], hingeSide: null, appearance: null, handle: null, mirror: false })) };
    const group = build(sliding);
    expect(zRange(group, 'shf_r1')).toEqual([-594, -100]);
    expect(zRange(group, 'prt_2')).toEqual([-594, -100]);
    expect(zRange(group, 'shf_l1')).toEqual([-594, -110]);
  });

  it('are labelled as fixed shelves', () => {
    expect(describeSelection(threeZones, { id: 'shf_l2', kind: 'shelf' })).toBe('מדף קבוע · 80.0 ס״מ מהבסיס · עובי 1.8 ס״מ');
    expect(describeSelection(threeZones, { id: 'shf_l1', kind: 'shelf' })).toBe('מדף · 40.0 ס״מ מהבסיס · עובי 1.8 ס״מ');
  });
});

