import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { insideRoom, minimumRoom, overlaps, roomBox, wardrobeFootprint } from '../../../src/room/layout.js';
import { ROOM_DEFAULTS } from '../../../src/room/roomState.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const wardrobe = (width, height, depth, count = 2) => applyOps(null, [{ op: 'create_wardrobe', width, height, depth, compartmentCount: count }], catalog);
const room = (patch = {}) => ({ ...ROOM_DEFAULTS, ...patch, size: { ...ROOM_DEFAULTS.size, ...(patch.size ?? {}) } });

describe('room layout', () => {
  it('stands the wardrobe against the back wall, inside the room, at its true size', () => {
    const design = loadDesign('basic');
    const box = roomBox(design, room());
    const foot = wardrobeFootprint(design);
    expect(box.zBack).toBe(-600 - 5);
    expect(insideRoom(foot, box)).toBe(true);
    expect(box.x1 - box.x0).toBe(4000);
    expect(box.clamped).toEqual([]);
  });

  it('places the wardrobe left, centre or right on the back wall', () => {
    const design = loadDesign('basic');
    const left = roomBox(design, room({ wardrobeAt: 'left' }));
    const centre = roomBox(design, room({ wardrobeAt: 'centre' }));
    const right = roomBox(design, room({ wardrobeAt: 'right' }));
    expect(-left.x0).toBe(50);
    expect(-centre.x0).toBe(1000);
    expect(right.x1 - 2000).toBe(50);
  });

  it('never shrinks the room below the wardrobe: sizes are raised and reported', () => {
    const design = wardrobe(3000, 2800, 650, 4);
    const box = roomBox(design, room({ size: { width: 2500, length: 2000, height: 2600 } }));
    const min = minimumRoom(design);
    expect(box.size).toEqual({ width: min.width, length: Math.max(2000, min.length), height: min.height });
    expect(box.clamped).toEqual(['width', 'height']);
    expect(insideRoom(wardrobeFootprint(design), box)).toBe(true);
  });

  for (const [width, height, depth] of [[1000, 1500, 500], [2000, 2400, 600], [2200, 2400, 650], [4500, 3000, 700]]) {
    it(`window and doorway fit the walls for a ${width}x${height}x${depth} wardrobe`, () => {
      const design = wardrobe(width, height, depth);
      for (const size of [ROOM_DEFAULTS.size, { width: 2000, length: 2000, height: 2200 }, { width: 8000, length: 8000, height: 4000 }]) {
        const box = roomBox(design, room({ size }));
        expect(box.window.z0).toBeGreaterThan(wardrobeFootprint(design).z1); // clear of the wardrobe
        expect(box.window.z1).toBeLessThanOrEqual(box.zFront);
        expect(box.window.y1).toBeLessThan(box.height);
        expect(box.window.y1 - box.window.y0).toBeGreaterThanOrEqual(700);
        expect(box.door.x0).toBeGreaterThanOrEqual(box.x0);
        expect(box.door.x1).toBeLessThanOrEqual(box.x1);
        expect(box.door.height).toBeLessThan(box.height);
      }
    });
  }

  it('rectangles: touching is not overlapping', () => {
    expect(overlaps({ x0: 0, x1: 10, z0: 0, z1: 10 }, { x0: 10, x1: 20, z0: 0, z1: 10 })).toBe(false);
    expect(overlaps({ x0: 0, x1: 10, z0: 0, z1: 10 }, { x0: 9, x1: 20, z0: 5, z1: 6 })).toBe(true);
  });
});
