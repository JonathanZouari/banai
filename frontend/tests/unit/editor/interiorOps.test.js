import { describe, expect, it, vi } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import {
  addInsertCandidates, coalesceKey, compartmentLeaves, presetOps, runFirst, siteOps, splitOps,
} from '../../../src/editor/interiorOps.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = () => loadDesign('basic');
const apply = (design, ops) => applyOps(design, ops, catalog);

describe('presets and inserts', () => {
  it('applies a preset through the engine', () => {
    const after = apply(basic(), presetOps('cmp_middle', 'drawers'));
    expect(after.compartments[1].drawers.length).toBe(3);
  });

  it('tries the floor first, then above each shelf and drawer, bottom-up', () => {
    const design = basic();
    const right = design.compartments[2];
    const ys = addInsertCandidates(right, 'shoes').map(([op]) => op.y);
    expect(ys[0]).toBe(0);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(ys).toContain(right.drawers[1].y + right.drawers[1].height);
    expect(addInsertCandidates(right, 'led')).toEqual([[{ op: 'add_insert', compartmentId: 'cmp_right', type: 'led' }]]);
  });

  it('places shoes above the drawers when the floor is taken', () => {
    const design = basic();
    let current = design;
    const run = (ops) => {
      try {
        current = apply(current, ops);
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    };
    const result = runFirst(run, addInsertCandidates(design.compartments[2], 'shoes'));
    expect(result.ok).toBe(true);
    const shoes = current.compartments[2].inserts[0];
    expect(shoes.y).toBeGreaterThan(0);
  });

  it('returns the first failure when nothing fits', () => {
    const run = vi.fn().mockReturnValueOnce({ ok: false, error: { code: 'OVERLAP' } }).mockReturnValue({ ok: false, error: { code: 'X' } });
    expect(runFirst(run, [[1], [2]])).toEqual({ ok: false, error: { code: 'OVERLAP' } });
    expect(runFirst(run, [])).toEqual({ ok: false, error: { code: 'INVALID_OP' } });
  });
});

describe('split doors', () => {
  it('splits a single leaf and joins the pair back', () => {
    const design = basic();
    const split = apply(design, splitOps(design, 'cmp_middle', true));
    expect(compartmentLeaves(split, 'cmp_middle')).toHaveLength(2);
    expect(splitOps(split, 'cmp_middle', true)).toBeNull();
    const joined = apply(split, splitOps(split, 'cmp_middle', false));
    expect(compartmentLeaves(joined, 'cmp_middle')).toHaveLength(1);
    expect(splitOps(joined, 'cmp_middle', false)).toBeNull();
  });

  it('has no leaves without hinged doors', () => {
    const sliding = apply(basic(), [{ op: 'configure_doors', type: 'sliding', count: 2 }]);
    expect(compartmentLeaves(sliding, 'cmp_middle')).toEqual([]);
    expect(splitOps(sliding, 'cmp_middle', true)).toBeNull();
  });
});

describe('site', () => {
  it('sets one field and clears one without losing the other', () => {
    expect(siteOps(null, 'ceiling', 2600)).toEqual([{ op: 'set_site', ceiling: 2600 }]);
    const design = apply(basic(), [{ op: 'set_site', ceiling: 2600, niche: 2100 }]);
    const cleared = apply(design, siteOps(design.site, 'ceiling', null));
    expect(cleared.site).toEqual({ ceiling: null, niche: 2100 });
    expect(siteOps({ ceiling: 2600, niche: null }, 'ceiling', null)).toEqual([{ op: 'set_site', clear: true }]);
  });
});

describe('coalesceKey', () => {
  it('names one control: op, target and fields', () => {
    expect(coalesceKey([{ op: 'modify_shelf', id: 'shf_a', y: 400 }])).toBe('modify_shelf:shf_a:y');
    expect(coalesceKey([{ op: 'modify_shelf', id: 'shf_a', y: 420 }])).toBe('modify_shelf:shf_a:y');
    expect(coalesceKey([{ op: 'update_dimensions', width: 2000 }])).toBe('update_dimensions::width');
    expect(coalesceKey([{ op: 'modify_compartment', compartmentId: 'cmp_a', width: 600 }])).toBe('modify_compartment:cmp_a:width');
  });

  it('never merges structural edits or batches', () => {
    expect(coalesceKey([{ op: 'add_shelf', compartmentId: 'cmp_a', y: 300 }])).toBeNull();
    expect(coalesceKey([{ op: 'modify_shelf', id: 'a', y: 1 }, { op: 'modify_shelf', id: 'b', y: 1 }])).toBeNull();
    expect(coalesceKey([])).toBeNull();
    expect(coalesceKey(null)).toBeNull();
  });
});
