// Motion in the live view: the deterministic open sequence (video), the pull-out poses, what may come
// out, and the sequenced springs. Expected numbers are worked out by hand for the basic wardrobe:
//   hinged doors: the shelf line is 25 mm behind the front (z -25) and the back panel's face at -594,
//   so the interior depth is 569 and a drawer runs out 0.7 x 569 = 398.3 mm.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createHardware } from '../../../src/viewer/hardware.js';
import { createHighlighter } from '../../../src/viewer/highlight.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import {
  PULL_OUT_CATEGORIES, SEQUENCE, doorsInScene, motionAt, motionTargets, pullOutAccess, sequencePose,
} from '../../../src/viewer/motion.js';
import { CLOSE_GATE, OPEN_GATE, createMotionDriver, springStep } from '../../../src/viewer/motionDriver.js';
import { buildProps, disposeProps } from '../../../src/viewer/props.js';
import { PULL_OUT_SHARE, applyPullOuts, carriedOffset, moverPose } from '../../../src/viewer/pullOuts.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';
import { threeZones } from './zoneDesigns.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const hardware = createHardware();
const build = (design, options = {}) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true, hardware, ...options });
const meshOf = (group, id) => group.children.find((m) => m.userData.componentId === id);
const partsOf = (group, id) => group.children.filter((m) => m.userData.componentId === id);
const mm = (v) => Math.round(v * 1e4) / 10 + 0; // m -> mm, to 0.1 mm
/** World extent (mm) of a mesh's own geometry, without its children (handle, edge lines). */
const boxMm = (mesh) => {
  mesh.updateMatrixWorld(true);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  return { y: [mm(box.min.y), mm(box.max.y)], z: [mm(box.min.z), mm(box.max.z)] };
};
const smooth = (x) => x * x * (3 - 2 * x);

/** basic with a 100 mm plinth and cmp_left emptied for all four inserts (as in inserts.test.js). */
function withInserts() {
  const design = structuredClone(basic);
  design.carcass.plinthHeight = 100;
  const [left] = design.compartments;
  left.shelves = [];
  left.inserts = [
    { id: 'ins_shoes', type: 'shoes', y: 0, tiers: 3, height: null },
    { id: 'ins_trousers', type: 'trousers', y: 800, tiers: null, height: 700 },
    { id: 'ins_pull', type: 'pulldown', y: 1900, tiers: null, height: null },
    { id: 'ins_led', type: 'led', y: null, tiers: null, height: null },
  ];
  return design;
}
const inserts = withInserts();

describe('the open sequence', () => {
  const grid = Array.from({ length: 201 }, (_, i) => i / 200);

  it('runs from closed to open', () => {
    expect(motionAt(0)).toEqual({ doors: 0, drawers: 0, trousers: 0, pulldown: 0 });
    expect(motionAt(1)).toEqual({ doors: 1, drawers: 1, trousers: 1, pulldown: 1 });
    expect(Object.keys(motionAt(0.5)).sort()).toEqual(['doors', ...PULL_OUT_CATEGORIES].sort());
  });

  it('is monotonic for every part', () => {
    Object.keys(SEQUENCE).forEach((part) => {
      grid.slice(1).forEach((t, i) => expect(motionAt(t)[part]).toBeGreaterThanOrEqual(motionAt(grid[i])[part]));
    });
  });

  it('leads with the doors, and the pull-outs follow with a slight overlap', () => {
    // Only the doors move up to t 0.35: smooth(0.2 / 0.45) open.
    expect(motionAt(0.2)).toEqual({ doors: smooth(0.2 / 0.45), drawers: 0, trousers: 0, pulldown: 0 });
    // The drawers start at 0.35 with the doors 0.87 open (smooth(0.35 / 0.45)); the doors finish at 0.45.
    expect(motionAt(0.35).doors).toBeCloseTo(0.8738, 4);
    expect(motionAt(0.45).doors).toBe(1);
    expect(motionAt(0.45).drawers).toBeGreaterThan(0); // the overlap
    expect(motionAt(0.45).pulldown).toBe(0); // the pull-down comes last
    expect(motionAt(0.8)).toMatchObject({ drawers: 1, trousers: 1 });
    grid.forEach((t) => {
      const at = motionAt(t);
      expect(at.doors).toBeGreaterThanOrEqual(at.drawers);
      expect(at.drawers).toBeGreaterThanOrEqual(at.pulldown);
      expect(at.trousers).toBe(at.drawers);
      if (at.drawers > 0) expect(at.doors).toBeGreaterThan(0.85); // nothing comes out of a half-open door
    });
  });

  it('clamps t', () => {
    expect(motionAt(-1)).toEqual(motionAt(0));
    expect(motionAt(2)).toEqual(motionAt(1));
    expect(motionAt(Number.NaN)).toEqual(motionAt(0));
  });

  it('poses every reachable part on it, deterministically', () => {
    const access = pullOutAccess(basic);
    const pose = sequencePose(access, 0.6, { hasDoors: true });
    expect(pose.doors).toBe(1);
    const drawers = motionAt(0.6).drawers;
    expect(drawers).toBeCloseTo(smooth(0.25 / 0.45), 12); // (0.6 - 0.35) / (0.8 - 0.35): 0.583
    expect(Object.fromEntries(pose.parts)).toEqual({ drw_r1: drawers, drw_r2: drawers });
    expect(sequencePose(access, 0.6, { hasDoors: true })).toEqual(pose);
  });
});

describe('drawers', () => {
  it('slide out 0.7 of the interior depth, with their fronts and handles', () => {
    const group = build(basic, { doorsVisible: false });
    const drawer = meshOf(group, 'drw_r1');
    expect(PULL_OUT_SHARE).toBe(0.7);
    expect(boxMm(drawer).z).toEqual([-594, -25]); // closed: the front on the shelf line
    expect(applyPullOuts(group, (id) => (id === 'drw_r1' ? 1 : 0))).toBe(true);
    expect(boxMm(drawer).z).toEqual([-195.7, 373.3]); // 398.3 mm out
    expect(boxMm(drawer).y).toEqual([21, 215]); // straight out: 18 + 3 .. 18 + 200 - 3
    group.updateMatrixWorld(true);
    const handle = drawer.children.find((c) => c.userData.part === 'handle');
    expect(mm(handle.getWorldPosition(new THREE.Vector3()).z)).toBe(373.3);
    expect(boxMm(meshOf(group, 'drw_r2')).z).toEqual([-594, -25]); // only the one asked for
    applyPullOuts(group, (id) => (id === 'drw_r1' ? 0.5 : 0));
    const [back, front] = boxMm(drawer).z;
    expect(back).toBeCloseTo(-594 + 199.15, 1); // half way: 199.15 mm
    expect(front).toBeCloseTo(-25 + 199.15, 1);
    expect(applyPullOuts(group, () => 0)).toBe(true);
    expect(drawer.position.toArray()).toEqual(drawer.userData.rest.position);
    expect(applyPullOuts(group, () => 0)).toBe(false); // nothing left to move
  });

  it('are open boxes behind their fronts', () => {
    const group = build(basic, { doorsVisible: false });
    applyPullOuts(group, (id) => (id === 'drw_r1' ? 1 : 0));
    group.updateMatrixWorld(true);
    // Straight down through the middle of drw_r1, 300 mm in front of the carcass: past the open top
    // and onto the drawer's bottom, inside the box.
    const ray = new THREE.Raycaster(new THREE.Vector3(1.661, 1, 0.3), new THREE.Vector3(0, -1, 0));
    const [hit] = ray.intersectObjects(group.children, false);
    expect(hit.object.userData.componentId).toBe('drw_r1');
    // The bottom's top face: 18 (floor of the interior) + 3 (gap) + 12 (body over the front's bottom) + 8.
    expect(mm(hit.point.y)).toBe(41); // not a lid at the top (215)
  });

  it('are picked and highlighted where they have moved', () => {
    const group = build(basic, { doorsVisible: false });
    applyPullOuts(group, (id) => (id === 'drw_r2' ? 1 : 0));
    group.updateMatrixWorld(true); // as the viewer does before raycasting
    const ray = new THREE.Raycaster(new THREE.Vector3(1.661, 0.3, 1), new THREE.Vector3(0, 0, -1));
    const [hit] = ray.intersectObjects(group.children, false);
    expect(hit.object.userData.componentId).toBe('drw_r2');
    expect(mm(hit.point.z)).toBe(373.3); // its front, out in the room
    const scene = new THREE.Scene();
    const highlighter = createHighlighter(scene);
    highlighter.update(group, basic, { id: 'drw_r2', kind: 'drawer' });
    const [outline] = scene.getObjectByName('highlight').children.filter((c) => c.isLineSegments);
    expect(outline.position.toArray()).toEqual(meshOf(group, 'drw_r2').position.toArray());
    highlighter.dispose();
  });
});

describe('the pull-down rail and the trouser rack', () => {
  // inserts: plinth 100, so interior y 0 is 118 above the floor. The pull-down at 1900 sits over the
  // trouser zone (800..1500): its arms fit in 1900 - 1500 - 30 = 370 mm. Stowed, the rail is at
  // y 118 + 1900 = 2018 and z -309.5 (the interior centre), the arms leaning back 0.12 rad; lowered,
  // they stand at 1.95 rad (from straight up, + toward the front).
  const L = 370;
  const pivot = { y: 2018 - L * Math.cos(0.12), z: -309.5 + L * Math.sin(0.12) };
  const lowered = { y: pivot.y + L * Math.cos(1.95), z: pivot.z + L * Math.sin(1.95) };

  it('swings the rail out and down on its arms at t = 1, level all the way', () => {
    const group = build(inserts, { doorsVisible: false });
    const access = pullOutAccess(inserts, { doorsVisible: false });
    const pose = sequencePose(access, 1);
    expect(pose.parts.get('ins_pull')).toBe(1);
    applyPullOuts(group, (id) => pose.parts.get(id) ?? 0);
    const [rail, ...rest] = partsOf(group, 'ins_pull');
    expect(mm(rail.position.y)).toBe(Math.round(lowered.y * 10) / 10); // 1513.7
    expect(mm(rail.position.z)).toBe(Math.round(lowered.z * 10) / 10); // 78.5: in front of the carcass
    expect(lowered.z).toBeGreaterThan(0);
    expect(2018 - lowered.y).toBeGreaterThan(500); // about half a metre down
    expect(rail.rotation.x).toBe(0); // the rail stays level
    const arms = rest.filter((m) => m.userData.motion.type === 'arm');
    expect(arms).toHaveLength(2);
    arms.forEach((arm) => {
      expect(arm.rotation.x).toBeCloseTo(1.95, 12);
      arm.updateMatrixWorld(true);
      const tip = arm.localToWorld(new THREE.Vector3(0, arm.geometry.parameters.height / 2, 0));
      const foot = arm.localToWorld(new THREE.Vector3(0, -arm.geometry.parameters.height / 2, 0));
      expect([mm(tip.y), mm(tip.z)]).toEqual([mm(rail.position.y), mm(rail.position.z)]); // the rail rides on the tips
      expect([mm(foot.y), mm(foot.z)]).toEqual([Math.round(pivot.y * 10) / 10, Math.round(pivot.z * 10) / 10]); // about fixed pivots
    });
    // The pull rod and hook come along without turning.
    rest.filter((m) => m.userData.motion.type === 'carried').forEach((part) => {
      const offset = part.position.clone().sub(new THREE.Vector3(...part.userData.rest.position));
      expect(mm(offset.y)).toBeCloseTo(mm(rail.position.y - rail.userData.rest.position[1]), 6);
      expect(part.rotation.x).toBe(part.userData.rest.rotationX);
    });
  });

  it('starts out of the carcass before it goes down (the arc of a wardrobe lift)', () => {
    const motion = meshOf(build(inserts, { doorsVisible: false }), 'ins_pull').userData.motion;
    const [, dyQuarter, dzQuarter] = carriedOffset(motion, 0.25);
    // A quarter in (0.40 rad): 370 (sin 0.40 + sin 0.12) = 187 mm forward, 370 (cos 0.12 - cos 0.40) = 26 mm down.
    expect(dzQuarter * 1000).toBeCloseTo(187.5, 0);
    expect(-dyQuarter * 1000).toBeCloseTo(26.2, 0);
    // It rises under 3 mm while the arms pass upright, then only goes down, ending in front of the carcass.
    const offsets = Array.from({ length: 21 }, (_, i) => carriedOffset(motion, i / 20));
    offsets.slice(2).forEach(([, dy], i) => expect(dy).toBeLessThan(offsets[i + 1][1]));
    expect(Math.max(...offsets.map(([, dy]) => dy)) * 1000).toBeLessThan(3);
    expect(-309.5 + offsets.at(-1)[2] * 1000).toBeGreaterThan(0);
    expect(moverPose({ motion }, 0)).toBeNull(); // no rest pose: not a mover
  });

  it('slides the trouser rack out with its trousers, and the garments ride down with the rail', () => {
    const group = build(inserts, { doorsVisible: false });
    const props = buildProps(inserts, { seed: 7 });
    const trousers = props.children.filter((c) => c.userData.part === 'trousers');
    const hangers = props.children.filter((c) => c.userData.carrier === 'ins_pull');
    expect(trousers.length).toBeGreaterThan(0);
    expect(trousers.every((c) => c.userData.carrier === 'ins_trousers')).toBe(true);
    expect(hangers.length).toBeGreaterThan(0);
    expect(props.children.filter((c) => c.userData.part === 'shoe').every((c) => !c.userData.carrier)).toBe(true);
    applyPullOuts(group, () => 1, props);
    const rack = partsOf(group, 'ins_trousers');
    rack.forEach((part) => expect(mm(part.position.z - part.userData.rest.position[2])).toBe(398.3));
    trousers.forEach((c) => expect(mm(c.position.z - c.userData.rest[2])).toBe(398.3));
    const rail = meshOf(group, 'ins_pull');
    const drop = rail.position.y - rail.userData.rest.position[1];
    hangers.forEach((c) => expect(c.position.y - c.userData.rest[1]).toBeCloseTo(drop, 12));
    applyPullOuts(group, () => 0, props);
    hangers.forEach((c) => expect(c.position.toArray()).toEqual(c.userData.rest));
    disposeProps(props);
  });
});

describe('what may come out', () => {
  it('is behind hinged doors until they open, which swing clear of everything', () => {
    expect(Object.fromEntries(pullOutAccess(basic))).toEqual({
      drw_r1: { category: 'drawers', covered: true, reachable: true, yields: false },
      drw_r2: { category: 'drawers', covered: true, reachable: true, yields: false },
    });
    expect(pullOutAccess(basic, { doorsVisible: false }).get('drw_r1').covered).toBe(false);
    expect(doorsInScene(basic)).toBe(true);
    expect(doorsInScene(basic, { doorsVisible: false })).toBe(false);
    expect(doorsInScene({ ...basic, doors: { ...basic.doors, type: 'none', items: [] } })).toBe(false);
  });

  it('follows the zone doors: a drawer in an open zone is not behind a door', () => {
    const access = pullOutAccess(threeZones);
    expect(access.get('drw_r1').covered).toBe(true); // zone 1, behind dr_r_z1
    expect(access.get('drw_r3').covered).toBe(false); // the open zone 2
  });

  it('is only what the opened sliding panels uncover', () => {
    const sliding = (count) => {
      const design = structuredClone(basic);
      design.compartments[1].drawers.push({ id: 'drw_m1', y: 0, height: 200, appearance: null, handle: null });
      design.doors = { ...design.doors, type: 'sliding', items: Array.from({ length: count }, (_, i) => ({ id: `dr_${i}`, compartmentIds: [], hingeSide: null, appearance: null, handle: null, mirror: false })) };
      return pullOutAccess(design);
    };
    // Two panels (992 wide): the front one runs over the back one to 18..1010, uncovering 1010..1982.
    const two = sliding(2);
    expect(two.get('drw_r1')).toMatchObject({ covered: true, reachable: true }); // 1343..1979
    expect(two.get('drw_m1')).toMatchObject({ covered: true, reachable: false }); // 682..1319
    // Three panels (668 wide at 18, 666, 1314): the middle one runs to 18..686, uncovering 686..1314.
    // The middle drawer (682..1319) overlaps the panels by 4 and 5 mm, within the 10 mm tolerance.
    const three = sliding(3);
    expect(three.get('drw_m1').reachable).toBe(true);
    expect(three.get('drw_r1').reachable).toBe(false);
  });

  it('leaves a rack in when the lowered pull-down above would hit it', () => {
    const access = pullOutAccess(inserts);
    expect(access.get('ins_trousers')).toMatchObject({ category: 'trousers', yields: true });
    expect(access.get('ins_pull')).toMatchObject({ category: 'pulldown', yields: false });
    expect(access.has('ins_shoes') || access.has('ins_led')).toBe(false); // fixed inserts
    expect(sequencePose(access, 1, { hasDoors: true }).parts.get('ins_trousers')).toBe(0);
    expect(motionTargets(access, { doorsOpen: true, hasDoors: true }).parts.get('ins_trousers')).toBe(0);
    // Selected on its own, it comes out (and the pull-down stays up).
    const single = motionTargets(access, { doorsOpen: true, hasDoors: true, selectedId: 'ins_trousers' });
    expect(Object.fromEntries(single.parts)).toMatchObject({ ins_trousers: 1, ins_pull: 0, drw_r1: 0 });
  });
});

describe('targets from the store state', () => {
  const access = pullOutAccess(basic);
  const parts = (targets) => Object.fromEntries(targets.parts);

  it('opens every reachable pull-out with the doors, and nothing while they are closed', () => {
    expect(motionTargets(access, { doorsOpen: true, hasDoors: true })).toEqual({ doors: 1, parts: new Map([['drw_r1', 1], ['drw_r2', 1]]) });
    expect(parts(motionTargets(access, { doorsOpen: false, hasDoors: true }))).toEqual({ drw_r1: 0, drw_r2: 0 });
  });

  it('brings out only the selected pull-out', () => {
    expect(motionTargets(access, { doorsOpen: true, hasDoors: true, selectedId: 'drw_r2' }))
      .toEqual({ doors: 1, parts: new Map([['drw_r1', 0], ['drw_r2', 1]]) });
    // Behind closed doors it stays in.
    expect(parts(motionTargets(access, { doorsOpen: false, hasDoors: true, selectedId: 'drw_r2' }))).toEqual({ drw_r1: 0, drw_r2: 0 });
    // Without doors in the scene it comes out on its own.
    const open = pullOutAccess(basic, { doorsVisible: false });
    expect(parts(motionTargets(open, { doorsOpen: false, hasDoors: false, selectedId: 'drw_r2' }))).toEqual({ drw_r1: 0, drw_r2: 1 });
    // In an open zone, also while the doors are closed.
    const zones = pullOutAccess(threeZones);
    expect(motionTargets(zones, { doorsOpen: false, hasDoors: true, selectedId: 'drw_r3' }).parts.get('drw_r3')).toBe(1);
  });

  it('lets the global state decide when the selection is not a pull-out', () => {
    expect(motionTargets(access, { doorsOpen: true, hasDoors: true, selectedId: 'shf_r1' }))
      .toEqual(motionTargets(access, { doorsOpen: true, hasDoors: true }));
    expect(parts(motionTargets(access, { doorsOpen: false, hasDoors: false, selectedId: 'dr_left' }))).toEqual({ drw_r1: 0, drw_r2: 0 });
  });
});

describe('the motion driver', () => {
  const FRAME = 1 / 60;
  const driverFor = (design, { doorsVisible = true } = {}) => {
    const driver = createMotionDriver();
    driver.configure(pullOutAccess(design, { doorsVisible }), { hasDoors: doorsInScene(design, { doorsVisible }) });
    return driver;
  };
  const run = (driver, seconds, options) => Array.from({ length: Math.round(seconds / FRAME) }, () => {
    driver.step(FRAME, options);
    return { doors: driver.doors, drawer: driver.opennessOf('drw_r1') };
  });

  it('springs without overshoot (critically damped) and settles exactly', () => {
    let [value, velocity] = [0, 0];
    for (let i = 0; i < 120; i += 1) {
      [value, velocity] = springStep(value, velocity, 1, 0.35, FRAME);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect([value, velocity]).toEqual([1, 0]);
  });

  it('opens the doors first, then the drawers; closing runs in reverse', () => {
    const driver = driverFor(basic);
    driver.setInputs({ doorsOpen: true });
    const opening = run(driver, 2);
    const firstOut = opening.findIndex((f) => f.drawer > 0);
    expect(firstOut).toBeGreaterThan(0);
    expect(opening[firstOut - 1].doors).toBeGreaterThanOrEqual(OPEN_GATE); // the doors were open enough
    expect(opening[firstOut].doors).toBeLessThan(1); // ...and still moving: a slight overlap
    expect(opening.at(-1)).toEqual({ doors: 1, drawer: 1 });
    expect(driver.settled).toBe(true);
    expect(driver.pullOuts()).toEqual({ drw_r1: 1, drw_r2: 1 });

    driver.setInputs({ doorsOpen: false });
    const closing = run(driver, 2);
    const firstClosing = closing.findIndex((f) => f.doors < 1);
    expect(closing[firstClosing - 1].drawer).toBeLessThanOrEqual(CLOSE_GATE); // the drawers went in first
    closing.slice(0, firstClosing).forEach((f) => expect(f.doors).toBe(1));
    expect(closing.at(-1)).toEqual({ doors: 0, drawer: 0 });
  });

  it('brings out only the selected drawer', () => {
    const driver = driverFor(basic);
    driver.setInputs({ doorsOpen: true, selectedId: 'drw_r2' });
    run(driver, 2);
    expect(driver.pullOuts()).toEqual({ drw_r1: 0, drw_r2: 1 });
    driver.setInputs({ doorsOpen: true, selectedId: 'drw_r1' }); // another one: they swap
    run(driver, 2);
    expect(driver.pullOuts()).toEqual({ drw_r1: 1, drw_r2: 0 });
    driver.setInputs({ doorsOpen: true, selectedId: null }); // deselected: the global state again
    run(driver, 2);
    expect(driver.pullOuts()).toEqual({ drw_r1: 1, drw_r2: 1 });
  });

  it('jumps to the end state with reduced motion', () => {
    const driver = driverFor(basic);
    driver.setInputs({ doorsOpen: true });
    expect(driver.step(FRAME, { reducedMotion: true })).toBe(true);
    expect([driver.doors, driver.pullOuts()]).toEqual([1, { drw_r1: 1, drw_r2: 1 }]);
    expect(driver.settled).toBe(true);
    driver.setInputs({ doorsOpen: false });
    driver.step(FRAME, { reducedMotion: true });
    expect([driver.doors, driver.pullOuts()]).toEqual([0, { drw_r1: 0, drw_r2: 0 }]);
    expect(driver.step(FRAME, { reducedMotion: true })).toBe(false);
  });

  it('holds the parts on the sequence while pinned, then hands them back to the store', () => {
    const driver = driverFor(basic);
    driver.pin(0.6);
    const drawers = motionAt(0.6).drawers;
    expect([driver.doors, driver.pullOuts()]).toEqual([1, { drw_r1: drawers, drw_r2: drawers }]);
    expect(driver.pinned).toBe(true);
    expect(driver.step(0.1)).toBe(false); // the springs do not touch a pinned pose
    driver.setInputs({ doorsOpen: true, selectedId: 'drw_r1' }); // the store changes meanwhile
    run(driver, 1);
    expect(driver.opennessOf('drw_r2')).toBe(drawers);
    driver.pin(1, { immediate: false }); // animated: the springs carry the parts there
    run(driver, 2);
    expect([driver.doors, driver.pullOuts()]).toEqual([1, { drw_r1: 1, drw_r2: 1 }]);
    driver.release();
    expect(driver.pinned).toBe(false);
    run(driver, 2);
    expect(driver.pullOuts()).toEqual({ drw_r1: 1, drw_r2: 0 }); // the store's selection again
  });

  it('snaps to the end pose for the path tracer', () => {
    const driver = driverFor(basic);
    driver.setInputs({ doorsOpen: true });
    driver.step(FRAME);
    expect(driver.settled).toBe(false);
    expect(driver.snap()).toBe(true);
    expect([driver.doors, driver.pullOuts(), driver.settled]).toEqual([1, { drw_r1: 1, drw_r2: 1 }, true]);
    driver.pin(0.3, { immediate: false });
    driver.snap(); // pinned: the sequence pose, not the store's
    expect([driver.doors, driver.opennessOf('drw_r1')]).toEqual([motionAt(0.3).doors, 0]);
  });

  it('keeps the openness of the parts that survive a rebuild', () => {
    const driver = driverFor(basic);
    driver.setInputs({ doorsOpen: true });
    driver.snap();
    const grown = structuredClone(basic);
    grown.compartments[2].drawers.push({ id: 'drw_r3', y: 400, height: 200, appearance: null, handle: null });
    driver.configure(pullOutAccess(grown), { hasDoors: true });
    expect(driver.pullOuts()).toEqual({ drw_r1: 1, drw_r2: 1, drw_r3: 0 }); // the new one slides out next
    run(driver, 2);
    expect(driver.opennessOf('drw_r3')).toBe(1);
    driver.configure(pullOutAccess(basic), { hasDoors: true });
    expect(Object.keys(driver.pullOuts())).toEqual(['drw_r1', 'drw_r2']);
    expect(driver.opennessOf('ins_gone')).toBe(0);
  });
});
