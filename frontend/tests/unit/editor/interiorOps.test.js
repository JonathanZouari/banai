import { describe, expect, it, vi } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import {
  addInsertCandidates, coalesceKey, compartmentLeaves, presetOps, runFirst, siteOps, siteReadingOps, spannedBy, splitOps,
  zoneDoorOps, zonePresetOps, zonesOf, zonesOps,
} from '../../../src/editor/interiorOps.js';
import { describeSelection } from '../../../src/editor/selectionContext.js';
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
  it('sets one field and clears one without losing the others', () => {
    expect(siteOps(null, 'clearance', 900)).toEqual([{ op: 'set_site', clearance: 900 }]);
    const design = apply(basic(), [{ op: 'set_site', ceiling: 2600, niche: 2100, clearance: 900 }]);
    const cleared = apply(design, siteOps(design.site, 'clearance', null));
    expect(cleared.site).toMatchObject({ ceiling: 2600, niche: 2100, clearance: null });
    expect(siteOps({ clearance: null }, 'clearance', null)).toBeNull(); // nothing to clear
  });

  it('keeps three readings; the smallest known one governs, and clearing the last one clears it', () => {
    const one = apply(basic(), siteReadingOps(null, 'heights', 1, 2580));
    expect(one.site).toMatchObject({ heights: [null, 2580, null], ceiling: 2580 });
    const two = apply(one, siteReadingOps(one.site, 'heights', 0, 2560));
    expect(two.site).toMatchObject({ heights: [2560, 2580, null], ceiling: 2560 });
    const back = apply(two, siteReadingOps(two.site, 'heights', 0, null));
    expect(back.site.ceiling).toBe(2580);
    expect(siteReadingOps(back.site, 'heights', 1, null)).toEqual([{ op: 'set_site', unset: ['ceiling'] }]);
    expect(apply(back, siteReadingOps(back.site, 'heights', 1, null)).site).toBeNull();
    expect(siteReadingOps(null, 'widths', 2, null)).toBeNull();
  });

  it('a single older niche is replaced by the first width reading', () => {
    const legacy = apply(basic(), [{ op: 'set_site', niche: 2100 }]);
    const ops = siteReadingOps(legacy.site, 'widths', 0, 2120);
    expect(ops).toEqual([{ op: 'set_site', widths: [2120, null, null] }]);
    expect(apply(legacy, ops).site).toMatchObject({ niche: 2120, widths: [2120, null, null] });
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

describe('zones', () => {
  const thirds = () => apply(basic(), zonesOps('cmp_left', 3));

  it('lists zones bottom-up with their usable range and door leaves', () => {
    const design = thirds();
    const zones = zonesOf(design, design.compartments[0]);
    expect(zones.map(({ zone, low, high, leaves }) => [zone, low, high, leaves])).toEqual([
      [1, 0, 800, 1], [2, 818, 1600, 1], [3, 1618, 2364, 1],
    ]);
    expect(zones[1].anchors).toEqual(['shf_l2', 'shf_l4']);
    expect(zonesOf(basic(), basic().compartments[1])).toEqual([{ zone: 1, low: 0, high: 2364, anchors: [null, null], leaves: 1 }]);
  });

  it('builds the zone ops the engine accepts', () => {
    const design = apply(thirds(), [...zoneDoorOps('cmp_left', 2, 0), ...zonePresetOps('cmp_left', 1, 'drawers')]);
    const zones = zonesOf(design, design.compartments[0]);
    expect(zones.map((z) => z.leaves)).toEqual([1, 0, 1]);
    expect(design.compartments[0].drawers).toHaveLength(3);
  });

  it('knows when a spanning door blocks zones', () => {
    const wide = apply(basic(), [{ op: 'configure_doors', type: 'hinged', doors: [
      { id: 'dr_w', compartmentIds: ['cmp_left', 'cmp_middle'], hingeSide: 'left' },
      { id: 'dr_r', compartmentIds: ['cmp_right'], hingeSide: 'right' }] }]);
    expect(spannedBy(wide, 'cmp_left')).toBe(true);
    expect(spannedBy(wide, 'cmp_right')).toBe(false);
  });

  it('describes zone doors and dividers', () => {
    const design = thirds();
    expect(describeSelection(design, { id: 'dr_left_z2', kind: 'door' })).toEqual({ compartmentId: 'cmp_left', text: 'תא 1 · אזור 2' });
    expect(describeSelection(design, { id: 'shf_l2', kind: 'shelf' }).text).toBe('תא 1 · מדף קבוע (בין אזורים)');
  });
});
