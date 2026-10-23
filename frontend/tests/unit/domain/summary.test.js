import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { exteriorSummary, interiorSummary } from '../../../src/domain/geometry.js';
import { loadCatalog, loadDesign } from './helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const after = (ops) => applyOps(basic, ops, catalog);

describe('interiorSummary', () => {
  it('summarises the basic wardrobe (gross volume, hanging length from rails)', () => {
    expect(interiorSummary(basic)).toEqual({
      width: 1964,
      height: 2364,
      depth: 600,
      compartmentWidths: [643, 643, 642],
      volumeLitres: (1928 * 2364 * 600) / 1e6,
      hangingLengthMm: 643,
      compartments: 3,
      shelves: 7,
      drawers: 2,
      rails: 1,
    });
  });

  it('follows the design after ops', () => {
    const changed = after([
      { op: 'add_shelf', compartmentId: 'cmp_left', y: 2000 },
      { op: 'add_rail', compartmentId: 'cmp_right', y: 1900 },
      { op: 'remove_component', id: 'drw_r2' },
    ]);
    const summary = interiorSummary(changed);
    expect(summary).toMatchObject({ shelves: 8, drawers: 1, rails: 2, hangingLengthMm: 643 + 642 });
  });

  it('has no hanging length without rails and shrinks with the height', () => {
    const changed = after([{ op: 'remove_component', id: 'rail_m1' }, { op: 'update_dimensions', height: 2200 }]);
    const summary = interiorSummary(changed);
    expect(summary.hangingLengthMm).toBe(0);
    expect(summary.height).toBe(2200 - 36);
    expect(summary.volumeLitres).toBeCloseTo((1928 * 2164 * 600) / 1e6, 6);
  });

  it('does not mutate the design', () => {
    const before = JSON.stringify(basic);
    interiorSummary(basic);
    exteriorSummary(basic);
    expect(JSON.stringify(basic)).toBe(before);
  });
});

describe('exteriorSummary', () => {
  it('summarises the outside of the basic wardrobe', () => {
    expect(exteriorSummary(basic)).toEqual({
      width: 2000,
      height: 2400,
      depth: 600,
      panelThickness: 18,
      footprintM2: 1.2,
      doorType: 'hinged',
      doorCount: 3,
      compartments: 3,
      shelves: 7,
      drawers: 2,
      rails: 1,
    });
  });

  it('reports open wardrobes as having no doors', () => {
    expect(exteriorSummary(after([{ op: 'configure_doors', type: 'none' }]))).toMatchObject({ doorType: 'none', doorCount: 0 });
  });
});
