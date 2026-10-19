// Room geometry (ADR-037): walls, free floor in front and space beside the wardrobe, and the viewer's frame.
// The cases are shared with the backend (shared/fixtures/room_geometry.json).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { effectiveClearance, fits, frontClearance, roomCorners, roomWalls, sideGap, toWardrobe } from '../../../src/domain/room.js';
import { loadCatalog, loadDesign } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(here, '..', '..', '..', '..', 'shared', 'fixtures', 'room_geometry.json'), 'utf-8'));
const catalog = loadCatalog();
const two = loadDesign('two'); // 1000 x 2000 x 500

describe('room geometry (shared cases)', () => {
  it.each(CASES.map((c) => [c.name, c]))('%s', (_, c) => {
    const design = applyOps(two, c.ops, catalog);
    expect(roomWalls(design.room.shape).map((w) => w.length)).toEqual(c.walls);
    expect(fits(design)).toBe(c.fits);
    expect(frontClearance(design)).toBe(c.front);
    expect([sideGap(design, 'left'), sideGap(design, 'right')]).toEqual([c.left, c.right]);
  });
});

describe('the viewer frame', () => {
  it('puts the wardrobe wall at the carcass back, its start at the left face minus the offset', () => {
    const design = applyOps(two, CASES[0].ops, catalog); // rect 3500 x 4000, wall 0, offset 1250
    const [c0, c1, c2] = roomCorners(design.room.shape);
    expect(toWardrobe(design, c0)).toEqual([-1250, -500]);
    expect(toWardrobe(design, c1)).toEqual([2250, -500]);
    expect(toWardrobe(design, c2)).toEqual([2250, 3500]); // the far wall, 3500 in front of the doors
  });

  it('the measured clearance wins over the room', () => {
    const design = applyOps(two, CASES[0].ops, catalog);
    expect(effectiveClearance(design)).toBe(3500);
    expect(effectiveClearance(applyOps(design, [{ op: 'set_site', clearance: 900 }], catalog))).toBe(900);
    expect(effectiveClearance(two)).toBeNull();
  });
});
