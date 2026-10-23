import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { verticalExtent, verticalGap } from '../../../src/viewer/dimensions.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const basic = loadDesign('basic');
const gap = (design, a, b) => verticalGap(verticalExtent(design, a), verticalExtent(design, b));

describe('vertical measurement (from the design)', () => {
  it('measures the clear gap between two shelves, in either order', () => {
    // shf_l1: y 400, 18 thick; shf_l2: y 800 -> 800 - 418
    expect(gap(basic, { id: 'shf_l1' }, { id: 'shf_l2' })).toBe(382);
    expect(gap(basic, { id: 'shf_l2' }, { id: 'shf_l1' })).toBe(382);
  });

  it('measures from the bottom panel and to the top panel', () => {
    expect(gap(basic, { id: 'carcass', part: 'bottom' }, { id: 'shf_l1' })).toBe(400);
    expect(verticalExtent(basic, { id: 'carcass', part: 'top' })).toMatchObject({ bottom: 2364 });
  });

  it('follows the design state, not the scene', () => {
    const moved = applyOps(basic, [{ op: 'modify_shelf', id: 'shf_l2', y: 900 }], loadCatalog());
    expect(gap(moved, { id: 'shf_l1' }, { id: 'shf_l2' })).toBe(482);
  });

  it('is zero for overlapping parts and null for parts that are not measurable', () => {
    expect(verticalGap({ bottom: 0, top: 100 }, { bottom: 50, top: 60 })).toBe(0);
    expect(verticalExtent(basic, { id: 'dr_left' })).toBeNull();
    expect(verticalExtent(basic, { id: 'carcass', part: 'left' })).toBeNull();
  });
});
