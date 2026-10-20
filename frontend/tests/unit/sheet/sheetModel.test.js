import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { STRINGS } from '../../../src/chat/i18n.js';
import { elevationScale } from '../../../src/sheet/elevation.js';
import { sheetFileName, sheetModel } from '../../../src/sheet/sheetModel.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');

describe('design sheet model', () => {
  it('summarises the basic wardrobe in centimetres', () => {
    const model = sheetModel({ design: basic, catalog, revision: 3 });
    expect(model.revision).toBe(3);
    expect(model.overall).toEqual({ width: '200.0', height: '240.0', depth: '60.0', panel: '1.8' });
    expect(model.compartments.map((c) => c.width)).toEqual(['64.3', '64.3', '64.2']);
    expect(model.compartments[0].shelves).toEqual(['40.0', '80.0', '120.0', '160.0']);
    expect(model.compartments[1].rails).toEqual(['190.0']);
    expect(model.compartments[2].drawers).toEqual([{ y: '0.0', height: '20.0' }, { y: '20.0', height: '20.0' }]);
    expect(model.partitions).toEqual({ count: 2, thickness: '1.8' });
    expect(model.doors).toEqual({ type: 'hinged', count: 3, hingeSides: ['left', 'right', 'left'] });
    expect(model.finishes.carcass).toEqual({
      material: { custom: false, name: 'Melamine board' },
      colour: { custom: false, name: 'White' },
      finish: { custom: false, name: 'Matte' },
    });
  });

  it('sorts items by height, names custom colours and drops door finishes without doors', () => {
    const design = applyOps(basic, [
      { op: 'add_shelf', compartmentId: 'cmp_left', y: 100, id: 'shf_low' },
      { op: 'set_material', target: 'carcass', color: { custom: true, name: 'Sage', hex: '#9caf88' } },
      { op: 'configure_doors', type: 'none' },
    ], catalog);
    const model = sheetModel({ design, catalog, revision: 1 });
    expect(model.compartments[0].shelves[0]).toBe('10.0');
    expect(model.finishes.carcass.colour).toEqual({ custom: true, name: 'Sage' });
    expect(model.finishes.doors).toBeNull();
    expect(model.doors).toEqual({ type: 'none', count: 0, hingeSides: [] });
  });

  it('shows wood tones by their catalog names', () => {
    const design = applyOps(basic, [{ op: 'set_material', target: 'doors', material: { catalogId: 'oak_veneer' }, color: { catalogId: 'teak' } }], catalog);
    const { doors } = sheetModel({ design, catalog, revision: 2 }).finishes;
    expect([doors.material.name, doors.colour.name]).toEqual(['Oak veneer', 'Teak']);
  });

  it('names the file by date', () => {
    expect(sheetFileName(new Date('2026-10-20T10:00:00Z'))).toBe('banai-design-2026-10-20.pdf');
  });
});

describe('front elevation scale', () => {
  it('fits the whole wardrobe inside the box and keeps proportions', () => {
    const { scale, drawWidth, drawHeight } = elevationScale(basic, 340, 330);
    expect(drawWidth).toBeLessThanOrEqual(340);
    expect(drawHeight).toBeLessThanOrEqual(330);
    expect(drawWidth / drawHeight).toBeCloseTo(2000 / 2400, 6);
    expect(scale).toBeGreaterThan(0);
  });
});

describe('sheet strings', () => {
  it('has the same sheet keys in Hebrew and English, and both state it is not a manufacturing drawing', () => {
    expect(Object.keys(STRINGS.he.sheet).sort()).toEqual(Object.keys(STRINGS.en.sheet).sort());
    expect(STRINGS.en.sheet.disclaimer).toMatch(/Not a manufacturing drawing/);
    expect(STRINGS.he.sheet.disclaimer).toMatch(/אינו שרטוט ייצור/);
  });
});
