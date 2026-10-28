import { describe, expect, it } from 'vitest';
import { designSummary } from '../../../src/domain/geometry.js';
import { deepFreeze } from '../../../src/domain/util.js';
import { loadDesign } from './helpers.js';

const empty = (overrides = {}) => ({ shelves: [], drawers: [], rails: [], ...overrides });

/** A minimal design: one compartment, nothing inside. Only the fields designSummary reads. */
const single = (compartment = {}) => ({
  dimensions: { width: 1036, height: 2036, depth: 600 },
  carcass: { panelThickness: 18 },
  compartments: [{ id: 'cmp_a', width: 1000, ...empty(), ...compartment }],
  partitions: [],
});

describe('designSummary', () => {
  it('summarises the basic wardrobe', () => {
    // 3 compartments (643 + 643 + 642 mm inner), interior height 2400 - 2 × 18, full depth 600.
    expect(designSummary(loadDesign('basic'))).toEqual({
      compartments: 3,
      shelves: 7,
      drawers: 2,
      rails: 1,
      interiorVolumeMm3: 1928 * 2364 * 600,
      hangingLengthMm: 643,
    });
  });

  it('uses inner widths, so partitions and side panels are not counted as space', () => {
    // 1000 wide: 2 × 20 sides + 20 partition + 470 + 470. Interior height 2000 - 2 × 20.
    const summary = designSummary(loadDesign('two'));
    expect(summary.interiorVolumeMm3).toBe(940 * 1960 * 500);
    expect(summary.hangingLengthMm).toBe(470);
    expect(summary).toMatchObject({ compartments: 2, shelves: 1, drawers: 1, rails: 1 });
  });

  it('reports zeros for an empty wardrobe, but still its interior volume', () => {
    expect(designSummary(single())).toEqual({
      compartments: 1,
      shelves: 0,
      drawers: 0,
      rails: 0,
      interiorVolumeMm3: 1000 * 2000 * 600,
      hangingLengthMm: 0,
    });
  });

  it('counts each rail: double hanging doubles that compartment\'s length', () => {
    const summary = designSummary(single({ rails: [{ id: 'rail_a', y: 1000 }, { id: 'rail_b', y: 1900 }] }));
    expect(summary.rails).toBe(2);
    expect(summary.hangingLengthMm).toBe(2 * 1000);
  });

  it('only counts compartments with rails towards the hanging length', () => {
    const design = {
      ...single(),
      dimensions: { width: 1054, height: 2036, depth: 600 },
      compartments: [
        { id: 'cmp_a', width: 300, ...empty({ rails: [{ id: 'rail_a', y: 1500 }] }) },
        { id: 'cmp_b', width: 700, ...empty({ shelves: [{ id: 'shf_b', y: 500, thickness: 18 }] }) },
      ],
      partitions: [{ id: 'prt_a', thickness: 18 }],
    };
    expect(designSummary(design).hangingLengthMm).toBe(300);
  });

  it('does not change the design', () => {
    const design = deepFreeze(loadDesign('basic'));
    expect(() => designSummary(design)).not.toThrow();
  });
});
