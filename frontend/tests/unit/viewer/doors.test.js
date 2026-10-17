// Door layout must equal the backend's manufacturing layout (backend/app/domain/layout.py), so
// the advisories and the carpenter PDF describe the doors drawn in 3D. Expected numbers are
// worked out by hand below from layout.py's formulas for the basic wardrobe:
//   W 2000, H 2400, panel 18, compartments 643 / 643 / 642, partitions 18 / 18
//   compartment x-ranges (outer): [18, 661], [679, 1322], [1340, 1982]
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { doorRects, hingedDoorRects, slidingDoorRects } from '../../../src/viewer/builders/doors.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import { applyDoorMotion, doorPose } from '../../../src/viewer/doorMotion.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design, options = { doorsVisible: true }) => buildWardrobe(design, createMaterials(catalog), options);
const doorMesh = (group, id) => group.children.find((m) => m.userData.componentId === id && m.userData.kind === 'door');
/** A door mesh's extent in mm: [x0, x1, y0, y1] (closed pose: no rotation). */
const extent = (mesh) => {
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position'));
  const mm = (v) => Math.round(v * 1e4) / 10; // 0.1 mm
  return [mm(mesh.position.x + box.min.x), mm(mesh.position.x + box.max.x), mm(mesh.position.y + box.min.y), mm(mesh.position.y + box.max.y)];
};
const rectMm = (r) => [r.x0, r.x0 + r.width, r.y0, r.y0 + r.height];

describe('hinged doors: full overlay as in layout.py', () => {
  // End doors reach the carcass outer edge (0 / W); between neighbours the edge is the middle of the
  // partition (661 + 18/2 = 670, 1322 + 9 = 1331). DOOR_GAP 3: each edge is inset 1.5 mm.
  // Height H - plinth - 3 = 2397 from y = plinth + 1.5 = 1.5.
  const expected = {
    dr_left: [1.5, 668.5, 1.5, 2398.5], // span 0..670: x0 1.5, width 667
    dr_middle: [671.5, 1329.5, 1.5, 2398.5], // span 670..1331: x0 671.5, width 658
    dr_right: [1332.5, 1998.5, 1.5, 2398.5], // span 1331..2000: x0 1332.5, width 666
  };

  it('computes the layout.py rectangles', () => {
    const rects = hingedDoorRects(basic, frameOf(basic));
    expect(Object.fromEntries(rects.map((r) => [r.door.id, rectMm(r)]))).toEqual(expected);
    expect(rects.map((r) => r.width)).toEqual([667, 658, 666]);
    // The doors and their 3 mm joints cover the whole front: 667 + 658 + 666 + 3 x 3 = 2000.
    expect(rects.reduce((sum, r) => sum + r.width + 3, 0)).toBe(2000);
  });

  it('draws the door meshes on exactly those rectangles, in front of the carcass', () => {
    const group = build(basic);
    Object.entries(expected).forEach(([id, mm]) => {
      const mesh = doorMesh(group, id);
      expect(extent(mesh)).toEqual(mm);
      expect(mesh.position.z).toBeCloseTo(0.009, 9); // 18 mm leaf from z = 0 to z = 18 mm
    });
  });

  it('starts above the plinth and loses the plinth from its height', () => {
    const raised = applyOps(basic, [{ op: 'update_dimensions', plinthHeight: 100 }], catalog);
    const rects = hingedDoorRects(raised, frameOf(raised));
    rects.forEach((r) => {
      expect(r.y0).toBe(101.5);
      expect(r.height).toBe(2297); // 2400 - 100 - 3
    });
    expect(extent(doorMesh(build(raised), 'dr_left'))).toEqual([1.5, 668.5, 101.5, 2398.5]);
  });

  it('spans a door over several compartments from the outer edge to the middle of the next partition', () => {
    const wide = applyOps(basic, [{ op: 'configure_doors', type: 'hinged',
      doors: [
        { id: 'dr_ab', compartmentIds: ['cmp_left', 'cmp_middle'], hingeSide: 'left' },
        { id: 'dr_c', compartmentIds: ['cmp_right'], hingeSide: 'right' },
      ] }], catalog);
    const rects = Object.fromEntries(hingedDoorRects(wide, frameOf(wide)).map((r) => [r.door.id, rectMm(r)]));
    expect(rects.dr_ab).toEqual([1.5, 1329.5, 1.5, 2398.5]); // span 0..1331
    expect(rects.dr_c).toEqual([1332.5, 1998.5, 1.5, 2398.5]); // span 1331..2000
  });

  it('puts the hinge line on the back edge of the hinge side', () => {
    const group = build(basic);
    expect(doorMesh(group, 'dr_left').userData.hinge).toEqual({ x: 0.0015, z: 0 });
    expect(doorMesh(group, 'dr_middle').userData.hinge.x).toBeCloseTo(1.3295, 9); // hinged right: x0 + width
  });

  it('never draws a door whose compartments are unknown', () => {
    const broken = structuredClone(basic);
    broken.doors.items[0].compartmentIds = ['cmp_gone'];
    expect(hingedDoorRects(broken, frameOf(broken)).map((r) => r.door.id)).toEqual(['dr_middle', 'dr_right']);
  });
});

describe('split leaves', () => {
  // split_door: dr_middle becomes the left leaf (hinged left), dr_middle2 the right leaf (hinged right).
  // The compartment span 670..1331 halves at 1000.5: leaves 670..1000.5 and 1000.5..1331, 3 mm joints.
  const split = applyOps(basic, [{ op: 'split_door', id: 'dr_middle', newId: 'dr_middle2' }], catalog);

  it('halves the compartment span, first leaf in items order on the left', () => {
    const rects = Object.fromEntries(hingedDoorRects(split, frameOf(split)).map((r) => [r.door.id, r]));
    expect(rectMm(rects.dr_middle)).toEqual([671.5, 999, 1.5, 2398.5]); // x0 670 + 1.5, width 330.5 - 3
    expect(rectMm(rects.dr_middle2)).toEqual([1002, 1329.5, 1.5, 2398.5]);
    expect([rects.dr_middle.leaf, rects.dr_middle2.leaf]).toEqual(['left', 'right']);
    expect(rects.dr_left.leaf).toBeNull();
    expect(rects.dr_middle.width).toBeCloseTo(327.5, 9);
  });

  it('follows the items order, not the hinge side', () => {
    const swapped = structuredClone(split);
    swapped.doors.items = [swapped.doors.items[0], swapped.doors.items[2], swapped.doors.items[1], swapped.doors.items[3]];
    const rects = Object.fromEntries(hingedDoorRects(swapped, frameOf(swapped)).map((r) => [r.door.id, r]));
    expect(rects.dr_middle2.leaf).toBe('left');
    expect(rects.dr_middle2.x0).toBe(671.5);
    expect(rects.dr_middle.x0).toBe(1002);
  });

  it('swings each leaf outward about its own hinge, free edges toward the viewer', () => {
    const group = build(split);
    const left = doorMesh(group, 'dr_middle');
    const right = doorMesh(group, 'dr_middle2');
    expect(left.userData.hinge.x).toBeCloseTo(0.6715, 9); // the leaf's own outer edge
    expect(right.userData.hinge.x).toBeCloseTo(1.3295, 9);
    applyDoorMotion(group, 1);
    group.updateMatrixWorld(true);
    const edgeOf = (mesh, sign) => mesh.localToWorld(new THREE.Vector3(sign * mesh.geometry.parameters.width / 2, 0, -mesh.geometry.parameters.depth / 2));
    // The hinge edges stay put; the meeting (free) edges swing out to the front, away from each other.
    expect(edgeOf(left, -1).x).toBeCloseTo(0.6715, 9);
    expect(edgeOf(right, 1).x).toBeCloseTo(1.3295, 9);
    const leftFree = edgeOf(left, 1);
    const rightFree = edgeOf(right, -1);
    expect(leftFree.z).toBeGreaterThan(0.3);
    expect(rightFree.z).toBeGreaterThan(0.3);
    expect(leftFree.x).toBeLessThan(0.6715 + 0.1); // swung back over its own hinge, not into the neighbour
    expect(rightFree.x).toBeGreaterThan(1.3295 - 0.1);
    expect(doorPose(left.userData, 1).rotationY).toBeLessThan(0);
    expect(doorPose(right.userData, 1).rotationY).toBeGreaterThan(0);
  });
});

describe('sliding panels as in layout.py', () => {
  // layout.py (_sliding): width (W - 2 panel + (n - 1) 20) / n, x0 = panel + i (width - 20);
  // y0 = plinth + panel + 12 (bottom guide), height = H - panel - 40 (top track) - y0 - 4 (play).
  // The dossier (production/parts.py) puts a panel's back face 30 mm (front track) or 60 mm (back
  // track) behind the carcass front; odd panels run in front.
  const three = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b', 'dr_c'] }], catalog);

  it('matches the formulas for three panels', () => {
    const rects = slidingDoorRects(three, frameOf(three));
    // (2000 - 36 + 40) / 3 = 668; x0 = 18, 18 + 648 = 666, 18 + 2 x 648 = 1314 (ends at 1982 = W - panel)
    expect(rects.map((r) => r.width)).toEqual([668, 668, 668]);
    expect(rects.map((r) => r.x0)).toEqual([18, 666, 1314]);
    expect(rects[0].y0).toBe(30); // 0 + 18 + 12
    expect(rects.map((r) => r.height)).toEqual([2308, 2308, 2308]); // 2400 - 18 - 40 - 30 - 4
    expect(rects.map((r) => r.track)).toEqual(['back', 'front', 'back']);
    const group = build(three);
    ['dr_a', 'dr_b', 'dr_c'].forEach((id, i) => expect(extent(doorMesh(group, id))).toEqual(rectMm(rects[i])));
  });

  it('keeps the formulas with two panels and a plinth', () => {
    const two = applyOps(basic, [
      { op: 'update_dimensions', plinthHeight: 80 },
      { op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] },
    ], catalog);
    const rects = slidingDoorRects(two, frameOf(two));
    expect(rects.map((r) => [r.x0, r.width])).toEqual([[18, 992], [990, 992]]); // (1964 + 20) / 2
    expect(rects.map((r) => [r.y0, r.height])).toEqual([[110, 2228], [110, 2228]]); // 80 + 18 + 12; 2400 - 18 - 40 - 110 - 4
  });

  it('runs the panels inside the carcass on a top track and a bottom guide', () => {
    const group = build(three);
    const depthOf = (mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      return [Math.round(box.min.z * 1e4) / 10, Math.round(box.max.z * 1e4) / 10];
    };
    expect(depthOf(doorMesh(group, 'dr_a'))).toEqual([-60, -42]); // back track
    expect(depthOf(doorMesh(group, 'dr_b'))).toEqual([-30, -12]); // front track
    const tracks = group.children.filter((m) => m.userData.part?.startsWith('track'));
    expect(tracks.map((m) => m.userData)).toEqual([
      { componentId: 'carcass', kind: 'carcass', part: 'track-top' },
      { componentId: 'carcass', kind: 'carcass', part: 'track-bottom' },
    ]);
    const [top, bottom] = tracks.map((m) => extent(m));
    expect(top).toEqual([18, 1982, 2342, 2382]); // 40 mm under the top panel
    expect(bottom).toEqual([18, 1982, 18, 30]); // 12 mm on the bottom panel
    // The tracks stay when the doors are hidden; hinged wardrobes have none.
    expect(build(three, { doorsVisible: false }).children.filter((m) => m.userData.part?.startsWith('track'))).toHaveLength(2);
    expect(build(basic).children.some((m) => m.userData.part?.startsWith('track'))).toBe(false);
  });

  it('keeps the interior behind the tracks, as the layout and the dossier do', () => {
    const frame = frameOf(three);
    expect(frame.shelfDepth).toBe(490); // layout.py: 600 - 100 - 10
    expect(frame.innerFront).toBe(-110);
    expect(frame.partitionFront).toBe(-100);
    const group = build(three);
    const front = (id) => Math.round(new THREE.Box3().setFromObject(group.children.find((m) => m.userData.componentId === id)).max.z * 1e4) / 10;
    expect(front('shf_l1')).toBe(-110);
    expect(front('drw_r1')).toBe(-110);
    expect(front('prt_1')).toBe(-100);
    const trackBack = Math.min(...group.children.filter((m) => m.userData.part?.startsWith('track'))
      .map((m) => new THREE.Box3().setFromObject(m).min.z));
    expect(trackBack * 1000).toBeGreaterThan(-100); // the tracks end in front of the partitions
  });

  it('has no rectangles without doors', () => {
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(doorRects(none, frameOf(none))).toEqual([]);
  });
});

describe('interior depth with hinged doors (layout.py shelf depth = depth - 25)', () => {
  it('sets shelves back 25 mm from the front and lets partitions reach it', () => {
    const frame = frameOf(basic);
    expect([frame.shelfDepth, frame.innerFront, frame.partitionFront]).toEqual([575, -25, 0]);
    const group = build(basic);
    const zRange = (id) => {
      const box = new THREE.Box3().setFromObject(group.children.find((m) => m.userData.componentId === id));
      return [Math.round(box.min.z * 1e4) / 10, Math.round(box.max.z * 1e4) / 10 + 0];
    };
    expect(zRange('shf_l1')).toEqual([-594, -25]); // from the back panel to the shelf line
    expect(zRange('prt_1')).toEqual([-594, 0]);
  });
});
