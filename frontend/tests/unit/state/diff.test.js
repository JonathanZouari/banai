import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { diffDesigns } from '../../../src/state/diff.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const after = (ops) => applyOps(basic, ops, catalog);

describe('diffDesigns', () => {
  it('is empty for the same design', () => {
    expect(diffDesigns(basic, basic)).toEqual([]);
  });

  it('describes dimensions, plinth and site from before to after', () => {
    const changed = after([
      { op: 'update_dimensions', width: 2400, plinthHeight: 80 },
      { op: 'set_site', ceiling: 2600 },
    ]);
    const lines = diffDesigns(basic, changed);
    expect(lines).toContain('רוחב: 200 ס״מ ← 240 ס״מ');
    expect(lines).toContain('צוקל: 0 ס״מ ← 8 ס״מ');
    expect(lines).toContain('תקרה: לא ידוע ← 260 ס״מ');
  });

  it('describes doors, mirrors and split leaves', () => {
    expect(diffDesigns(basic, after([{ op: 'configure_doors', type: 'sliding', count: 3 }]))).toContain('דלתות: ציר ← הזזה');
    expect(diffDesigns(basic, after([{ op: 'modify_door', id: 'dr_left', mirror: true }]))).toContain('דלתות מראה: 0 ← 1');
    expect(diffDesigns(basic, after([{ op: 'split_door', id: 'dr_middle' }]))).toContain('תא 2: שתי דלתות');
  });

  it('describes interior items and inserts per compartment', () => {
    const changed = after([
      { op: 'apply_preset', compartmentId: 'cmp_middle', preset: 'drawers' },
      { op: 'add_insert', compartmentId: 'cmp_left', type: 'led' },
    ]);
    const lines = diffDesigns(basic, changed);
    expect(lines).toContain('תא 2: 0 מגירות ← 3 מגירות');
    expect(lines).toContain('תא 1: + תאורת LED');
    expect(diffDesigns(changed, basic)).toContain('תא 1: − תאורת LED');
  });

  it('reports a new compartment', () => {
    const changed = after([{ op: 'add_partition', compartmentId: 'cmp_left', offset: 300, newCompartmentId: 'cmp_new' }]);
    const lines = diffDesigns(basic, changed);
    expect(lines).toContain('תאים: 3 ← 4');
    expect(lines.some((line) => line.startsWith('תא 2 חדש'))).toBe(true);
  });
});
