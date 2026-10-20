// Stretch rules (viewer/resizeRules.js, ADR-039 stage 2): which handles show, their limits, the ops a drop sends,
// and how the camera keeps the room still.
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { handlesFor, resizeSpec, roomShift } from '../../../src/viewer/resizeRules.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // 2000 x 2400 x 600
const apply = (design, ops) => applyOps(design, ops, catalog);
const roomed = apply(basic, [{ op: 'set_room', shape: { kind: 'rect', width: 4000, depth: 4000 } }]); // offset 1000
const handle = (design, key, selection = null, active = null) => handlesFor(design, selection, active).find((h) => h.key === key);

describe('which handles show', () => {
  it('the wardrobe has four, a drawer one, an obstacle four once clicked (skirting three), the room its walls', () => {
    const keys = (design, selection, active) => handlesFor(design, selection, active).map((h) => h.key);
    expect(keys(basic, null)).toEqual([]);
    expect(keys(basic, { kind: 'door', id: 'dr_left' })).toEqual(['wardrobe:left', 'wardrobe:right', 'wardrobe:top', 'wardrobe:front']);
    expect(keys(basic, { kind: 'drawer', id: 'drw_r1' })).toEqual(['item:drw_r1:top']);
    expect(keys(basic, { kind: 'shelf', id: 'shf_l1' })).toEqual([]);
    expect(keys(roomed, null)).toEqual(['wall:0', 'wall:1', 'wall:2', 'wall:3']);
    // On the wardrobe's own wall the handle sits beside it (here 100 cm of free wall each side), not behind it.
    expect(handle(roomed, 'wall:0').at[0]).toBe(-500);
    const tight = apply(basic, [{ op: 'set_room', shape: { kind: 'rect', width: 2200, depth: 4000 } }]); // 10 cm each side
    expect(keys(tight, null)).toEqual(['wall:1', 'wall:2', 'wall:3']);
    const site = apply(roomed, [{ op: 'set_site', obstacles: [{ type: 'socket', x: 0, y: 300, width: 80, height: 80 },
      { type: 'panel', x: -500, y: 0, width: 3000, height: 80 }] }]);
    expect(keys(site, null, { kind: 'obstacle', index: 0 }).filter((k) => k.startsWith('obstacle'))).toHaveLength(4);
    expect(keys(site, null, { kind: 'obstacle', index: 1 }).filter((k) => k.startsWith('obstacle'))).toEqual(
      ['obstacle:1:left', 'obstacle:1:right', 'obstacle:1:top']);
  });
});

describe('what a stretch does', () => {
  it('the right edge widens up to the wall’s end; the left edge also moves the wardrobe and keeps its right edge', () => {
    const right = resizeSpec(roomed, handle(roomed, 'wardrobe:right', { kind: 'door' }));
    expect(right.axis).toMatchObject({ value: 2000, limits: [300, 3000] });
    expect(apply(roomed, right.ops(2400)).dimensions.width).toBe(2400);
    const left = resizeSpec(roomed, handle(roomed, 'wardrobe:left', { kind: 'door' }));
    expect(left.axis).toMatchObject({ value: 0, limits: [-1000, 1700] });
    const moved = apply(roomed, left.ops(-300)); // 30 cm out to the left
    expect([moved.dimensions.width, moved.room.offset]).toEqual([2300, 700]);
    expect(left.shift(-300)).toEqual([300, 0]); // the camera moves so the right edge stays on screen
  });

  it('height and depth: the depth grows forward, the back stays at the wall', () => {
    const top = resizeSpec(basic, handle(basic, 'wardrobe:top', { kind: 'door' }));
    expect(apply(basic, top.ops(2200)).dimensions.height).toBe(2200);
    const front = resizeSpec(basic, handle(basic, 'wardrobe:front', { kind: 'door' }));
    expect(apply(basic, front.ops(650)).dimensions.depth).toBe(650);
    expect(front.ghost(650).max[2]).toBe(50);
    expect(front.shift(650)).toEqual([0, -50]);
  });

  it('a drawer grows up to the next thing above it', () => {
    const spec = resizeSpec(basic, handle(basic, 'item:drw_r2:top', { kind: 'drawer', id: 'drw_r2' })); // 200 at 200, shelf at 800
    expect(spec.axis).toMatchObject({ value: 200, limits: [50, 600] });
    expect(apply(basic, spec.ops(350)).compartments[2].drawers[1].height).toBe(350);
  });

  it('an obstacle’s left and bottom edges move it too; skirting keeps its bottom', () => {
    const site = apply(roomed, [{ op: 'set_site', obstacles: [{ type: 'ac', x: 200, y: 2000, width: 900, height: 300 }] }]);
    const active = { kind: 'obstacle', index: 0 };
    const left = resizeSpec(site, handle(site, 'obstacle:0:left', null, active));
    expect(apply(site, left.ops(100)).site.obstacles[0]).toMatchObject({ x: 100, width: 1000 });
    const bottom = resizeSpec(site, handle(site, 'obstacle:0:bottom', null, active));
    expect(apply(site, bottom.ops(1900)).site.obstacles[0]).toMatchObject({ y: 1900, height: 400 });
    expect(bottom.label(1900)).toBe('90×40 ס״מ');
  });

  it('room walls: the right wall widens the room; the left wall too, and the wardrobe stays where it is', () => {
    const right = resizeSpec(roomed, handle(roomed, 'wall:1'));
    expect(right.axis).toMatchObject({ value: 4000, limits: [1000, 15000] });
    const wider = apply(roomed, right.ops(4500));
    expect([wider.room.shape.width, wider.room.offset]).toEqual([4500, 1000]);
    expect(roomShift(roomed, wider, right.anchor, 4500)).toEqual([0, 0]);

    const left = resizeSpec(roomed, handle(roomed, 'wall:3')); // the wall before the wardrobe's: its start corner moves
    const grown = apply(roomed, left.ops(4500));
    expect([grown.room.shape.width, grown.room.offset]).toEqual([4500, 1500]);
    expect(roomShift(roomed, grown, left.anchor, 4500)).toEqual([0, 0]); // the far corner stays: the camera does not move

    const back = resizeSpec(roomed, handle(roomed, 'wall:0')); // the wardrobe's own wall moves out, with it
    const deeper = apply(roomed, back.ops(4500));
    expect(deeper.room.shape.depth).toBe(4500);
    expect(roomShift(roomed, deeper, back.anchor, 4500)).toEqual([0, 500]); // the room stays, so the camera follows
  });

  it('the limits are what the engine accepts', () => {
    // Narrowest: each compartment keeps 5 cm after scaling; lowest: the highest shelf (1600 + 18) still fits.
    const right = resizeSpec(basic, handle(basic, 'wardrobe:right', { kind: 'door' }));
    expect(() => apply(basic, right.ops(right.axis.limits[0]))).not.toThrow();
    expect(() => apply(basic, right.ops(right.axis.limits[0] - 40))).toThrow();
    const top = resizeSpec(basic, handle(basic, 'wardrobe:top', { kind: 'door' }));
    expect(top.axis.limits[0]).toBe(2054); // 2000 (the top shelf in cmp_middle) + 18 + 2 x 18
    expect(() => apply(basic, top.ops(top.axis.limits[0]))).not.toThrow();
  });

  it('a wall keeps the room\u2019s openings and the wardrobe where they are, and stops before they would fall off', () => {
    const design = apply(roomed, [{ op: 'set_room', openings: [{ type: 'window', wall: 0, at: 200, width: 600, height: 1000, sill: 900 }] }]);
    const left = resizeSpec(design, handle(design, 'wall:3'));
    const grown = apply(design, left.ops(4500));
    expect([grown.room.offset, grown.room.openings[0].at]).toEqual([1500, 700]); // both measured from the corner that moved
    expect(left.axis.limits[0]).toBe(3800); // the window (20 cm from the corner) stops the wall
    expect(() => apply(design, left.ops(left.axis.limits[0]))).not.toThrow();
  });
});
