// The room drawn around the wardrobe (viewer/room.js): door swings, drawer pull-outs, the free floor line
// and the niche through the customer's readings. The reach and the blocked flags must agree with advice R21.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import { clearanceLine, createRoomOverlay, doorSwings, drawerReach, drawerZones, nicheOutline } from '../../../src/viewer/room.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // W 2000, H 2400, D 600, three hinged doors
const withSite = (design, site) => applyOps(design, [{ op: 'set_site', ...site }], catalog);
const round = (points) => points.map(([a, b]) => [Math.round(a), Math.round(b)]);

describe('room overlay geometry', () => {
  it('a hinged leaf sweeps a quarter circle as wide as the leaf, from its hinge side', () => {
    const swings = doorSwings(withSite(basic, { clearance: 1200 }));
    expect(swings.length).toBe(basic.doors.items.length);
    for (const swing of swings) {
      const door = basic.doors.items.find((d) => d.id === swing.id);
      const [hinge] = swing.points.slice(-1);
      const [closed, open] = [swing.points[0], swing.points.at(-2)];
      expect(Math.hypot(closed[0] - hinge[0], closed[1] - hinge[1])).toBeCloseTo(swing.radius);
      expect(open[0]).toBeCloseTo(hinge[0]); // open: square to the front
      expect(open[1] - hinge[1]).toBeCloseTo(swing.radius);
      expect(Math.sign(closed[0] - hinge[0])).toBe(door.hingeSide === 'right' ? -1 : 1);
      expect(swing.blocked).toBe(false);
    }
  });

  it('flags the swings and pull-outs that do not fit, like advice R21', () => {
    const tight = withSite(applyOps(basic, [{ op: 'add_drawer', compartmentId: basic.compartments[0].id, y: 0, height: 200 }], catalog),
      { clearance: 500 });
    expect(doorSwings(tight).every((s) => s.blocked)).toBe(true); // ~66 cm leaves, 50 cm free
    const frame = frameOf(tight);
    expect(drawerReach(frame)).toBe(550); // shelf depth 575, set back 25: as R21's estimate
    const zones = drawerZones(tight);
    expect(zones[0]).toEqual({ index: 0, x0: frame.ranges[0][0], x1: frame.ranges[0][1], reach: 550, blocked: true });
    expect(zones.map((z) => z.index)).toEqual(tight.compartments.flatMap((c, i) => (c.drawers.length ? [i] : [])));
    expect(zones.every((z) => z.blocked)).toBe(true);
    expect(clearanceLine(tight)).toMatchObject({ z: 500, label: 'מרחב פנוי 50.0 ס״מ' });
    expect(clearanceLine(basic)).toBeNull();
  });

  it('draws the niche through the readings: slanted when the walls are out of square', () => {
    const crooked = withSite(basic, { widths: [2100, 2060, 2080], heights: [2600, 2570, null] });
    const { walls, ceiling } = nicheOutline(crooked);
    expect(round(walls[0])).toEqual([[-50, 2470], [-30, 1285], [-40, 100]]); // left wall, top to bottom (the ceiling is 2570, the lowest point)
    expect(round(walls[1])).toEqual([[2050, 2470], [2030, 1285], [2040, 100]]);
    expect(round(ceiling)).toEqual([[-50, 2600], [1000, 2570]]); // left and middle; right unknown
  });

  it('a single value is a straight wall or ceiling; no site, no niche', () => {
    const single = nicheOutline(withSite(basic, { niche: 2100, ceiling: 2600 }));
    expect(round(single.walls[0])).toEqual([[-50, 2600], [-50, 0]]);
    expect(round(single.ceiling)).toEqual([[-50, 2600], [2050, 2600]]);
    const oneReading = nicheOutline(withSite(basic, { widths: [null, 2080, null] }));
    expect(round(oneReading.walls[1])).toEqual([[2040, 2600], [2040, 0]]);
    expect(nicheOutline(basic)).toEqual({ walls: [], ceiling: [] });
  });
});

describe('room overlay in the scene', () => {
  it('redraws on update, hides for renders, and frees everything on dispose', () => {
    const scene = new THREE.Scene();
    const room = createRoomOverlay(scene);
    room.update(basic);
    expect(room.group.children).toHaveLength(0); // no site, nothing drawn
    const lines = () => room.group.children.filter((c) => c.isLine);
    room.update(withSite(basic, { widths: [2100, 2060, 2080], heights: [2600, 2570, 2590] }));
    expect(lines()).toHaveLength(3); // two walls and the ceiling
    room.setVisible(false);
    expect(room.group.visible).toBe(false);
    room.dispose();
    expect(scene.getObjectByName('room')).toBeUndefined();
  });
});
