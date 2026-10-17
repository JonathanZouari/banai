// Viewer-created text is Hebrew (the app is RTL); compare mode shows the saved version.
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { WARDROBE_LABELS, selectedStepper } from '../../../src/viewer/dimensions.js';
import { describeSelection } from '../../../src/viewer/format.js';
import { shownState } from '../../../src/viewer/viewer.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const HEBREW = /[֐-׿]/;
const describe_ = (id, kind) => describeSelection(basic, { id, kind });

describe('dimension labels', () => {
  it('reads width, height and depth in Hebrew centimetres', () => {
    const text = Object.fromEntries(WARDROBE_LABELS.map((spec) => [spec.field, spec.text(basic.dimensions)]));
    expect(text).toEqual({ width: 'רוחב 200.0 ס״מ', height: 'גובה 240.0 ס״מ', depth: 'עומק 60.0 ס״מ' });
  });

  it('names every stepper button in Hebrew', () => {
    const labels = [
      ...WARDROBE_LABELS.flatMap((spec) => [spec.minus, spec.plus]),
      ...['shelf', 'drawer', 'rail', 'compartment'].flatMap((kind) => Object.values(selectedStepper({ kind })).slice(1)),
    ];
    expect(labels).toHaveLength(14);
    labels.forEach((label) => expect(label).toMatch(HEBREW));
    expect(selectedStepper({ kind: 'shelf' })).toEqual({ field: 'y', minus: 'הורדת המדף', plus: 'הגבהת המדף' });
    ['insert', 'door', 'carcass', 'partition'].forEach((kind) => expect(selectedStepper({ kind })).toBeNull());
  });
});

describe('selection labels', () => {
  it('describes each kind in Hebrew', () => {
    expect(describe_('carcass', 'carcass')).toBe('ארון · 200.0 × 240.0 × 60.0 ס״מ');
    expect(describe_('cmp_middle', 'compartment')).toBe('תא 2 · רוחב 64.3 ס״מ');
    expect(describe_('shf_l1', 'shelf')).toBe('מדף · 40.0 ס״מ מהבסיס · עובי 1.8 ס״מ');
    expect(describe_('drw_r2', 'drawer')).toBe('מגירה · 20.0 ס״מ מהבסיס · גובה 20.0 ס״מ');
    expect(describe_('rail_m1', 'rail')).toBe('מוט תלייה · 190.0 ס״מ מהבסיס');
    expect(describe_('prt_2', 'partition')).toBe('מחיצה 2 · עובי 1.8 ס״מ');
    expect(describe_('dr_left', 'door')).toBe('דלת ציר · ציר שמאלי');
    expect(describe_('dr_middle', 'door')).toBe('דלת ציר · ציר ימני');
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] }], catalog);
    expect(describeSelection(sliding, { id: 'dr_a', kind: 'door' })).toBe('דלת הזזה');
    expect(describeSelection(basic, null)).toBe('');
  });
});

describe('compare mode', () => {
  const version = applyOps(basic, [{ op: 'update_dimensions', width: 2400 }], catalog);
  const selection = { id: 'shf_l1', kind: 'shelf' };

  it('shows the saved version, without a selection, only while comparing', () => {
    expect(shownState({ design: basic, selection, version, ui: { comparing: true } })).toEqual({ design: version, selection: null, comparing: true });
    expect(shownState({ design: basic, selection, version, ui: { comparing: false } })).toEqual({ design: basic, selection, comparing: false });
  });

  it('reads the store defensively', () => {
    expect(shownState({ design: basic, selection, version: null, ui: { comparing: true } }).design).toBe(basic);
    expect(shownState({ design: basic, ui: {} })).toEqual({ design: basic, selection: null, comparing: false });
    expect(shownState({ design: basic, selection })).toEqual({ design: basic, selection, comparing: false });
  });
});
