import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { createRoomScene } from '../../../src/room/roomScene.js';
import { ROOM_DEFAULTS } from '../../../src/room/roomState.js';
import { doorSwings, inTheWay } from '../../../src/room/swing.js';
import { VISUAL } from '../../../src/viewer/units.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // 3 hinged doors: left (hinge left), middle (hinge right), right (hinge left)
const close = (p, q) => expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThan(1e-6);

describe('door swing', () => {
  it('a hinged door sweeps a quarter circle from its hinge, as wide as its leaf', () => {
    const [left, middle] = doorSwings(basic);
    // Compartment 1 spans x 18..661 (panel 18 + width 643); the leaf is 2 mm in from each side.
    expect(left).toMatchObject({ type: 'hinged', doorId: 'dr_left', hinge: { x: 18 + VISUAL.doorGap, z: VISUAL.doorThickness } });
    expect(left.radius).toBe(643 - 2 * VISUAL.doorGap);
    close(left.polygon[1], { x: left.hinge.x + left.radius, z: left.hinge.z }); // closed: along the front
    close(left.polygon.at(-1), { x: left.hinge.x, z: left.hinge.z + left.radius }); // open: straight out
    // Hinge on the right: closed toward -x, open straight out from the right edge.
    expect(middle.hinge.x).toBe(18 + 643 + 18 + 643 - VISUAL.doorGap);
    close(middle.polygon[1], { x: middle.hinge.x - middle.radius, z: middle.hinge.z });
    close(middle.polygon.at(-1), { x: middle.hinge.x, z: middle.hinge.z + middle.radius });
    // Every arc point is on the circle, in front of the wardrobe.
    middle.polygon.slice(1).forEach((p) => {
      expect(Math.hypot(p.x - middle.hinge.x, p.z - middle.hinge.z)).toBeCloseTo(middle.radius, 6);
      expect(p.z).toBeGreaterThanOrEqual(middle.hinge.z - 1e-9);
    });
  });

  it('a door over two compartments sweeps both, partition included', () => {
    const wide = applyOps(null, [
      { op: 'create_wardrobe', width: 1600, height: 2200, depth: 600, compartmentCount: 2, compartmentIds: ['cmp_a', 'cmp_b'] },
      { op: 'configure_doors', type: 'hinged', doors: [{ id: 'dr_one', compartmentIds: ['cmp_a', 'cmp_b'], hingeSide: 'left' }] },
    ], catalog);
    const [swing] = doorSwings(wide);
    expect(swing.radius).toBe(1600 - 2 * 18 - 2 * VISUAL.doorGap);
  });

  it('sliding doors need only their track band; no doors, nothing', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] }], catalog);
    const [track] = doorSwings(sliding);
    expect(track.type).toBe('sliding');
    expect(track.rect).toMatchObject({ x0: 18, x1: 2000 - 18, z0: 0 });
    expect(track.rect.z1).toBeLessThan(120);
    expect(doorSwings(applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog))).toEqual([]);
  });

  it('in the way: inside the arc yes; in the corner beyond the arc or behind the wardrobe no', () => {
    const [left] = doorSwings(basic);
    const { x, z } = left.hinge;
    const r = left.radius;
    expect(inTheWay(left, { x0: x + 100, x1: x + 300, z0: z + 100, z1: z + 300 })).toBe(true);
    expect(inTheWay(left, { x0: x + r * 0.8, x1: x + r * 0.95, z0: z + r * 0.8, z1: z + r * 0.95 })).toBe(false);
    expect(inTheWay(left, { x0: x, x1: x + 400, z0: -500, z1: z })).toBe(false);
    const sliding = { type: 'sliding', rect: { x0: 0, x1: 1000, z0: 0, z1: 80 } };
    expect(inTheWay(sliding, { x0: 500, x1: 700, z0: 50, z1: 400 })).toBe(true);
    expect(inTheWay(sliding, { x0: 500, x1: 700, z0: 80, z1: 400 })).toBe(false);
  });
});

describe('door swing in the room', () => {
  const scene = () => {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#eceeec');
    return s;
  };
  const lights = () => ({ hemi: new THREE.HemisphereLight(), key: new THREE.DirectionalLight(), fill: new THREE.DirectionalLight() });

  it('is drawn on the floor, and a piece standing where a door opens is outlined (visual only)', () => {
    // A real case: two 1 m doors in a 400 x 360 cm room leave the bed nowhere outside their swing.
    const design = applyOps(null, [{ op: 'create_wardrobe', width: 2000, height: 2400, depth: 600, compartmentCount: 2 }, { op: 'configure_doors', type: 'hinged' }], catalog);
    const s = scene();
    createRoomScene({ scene: s, lights: lights(), grid: null }).update(design, { ...ROOM_DEFAULTS, enabled: true, size: { width: 4000, length: 3600, height: 2600 } });
    expect(s.getObjectByName('door-swing')).toBeTruthy();
    expect(s.getObjectByName('in-the-way-bed')).toBeTruthy();
  });

  it('can be turned off', () => {
    const s = scene();
    createRoomScene({ scene: s, lights: lights(), grid: null }).update(basic, { ...ROOM_DEFAULTS, enabled: true, showSwing: false });
    expect(s.getObjectByName('door-swing')).toBeUndefined();
  });
});
