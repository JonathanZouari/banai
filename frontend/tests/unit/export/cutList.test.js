import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildCutList, countParts, describeAppearance } from '../../../src/export/cutList.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const row = (list, name) => list.parts.filter((p) => p.name.startsWith(name));

describe('cut list', () => {
  it('lists the carcass from the design dimensions', () => {
    const list = buildCutList(basic, catalog);
    expect(list.overall).toEqual({ width: 2000, height: 2400, depth: 600 });
    expect(row(list, 'Side panel')).toEqual([expect.objectContaining({ qty: 2, length: 2400, width: 600, thickness: 18 })]);
    expect(row(list, 'Top panel')[0]).toMatchObject({ length: 1964, width: 600, qty: 1 });
    expect(row(list, 'Back panel')[0]).toMatchObject({ length: 1964, width: 2364 });
  });

  it('merges identical parts and counts every shelf, drawer, rail, partition and door', () => {
    const list = buildCutList(basic, catalog);
    expect(row(list, 'Vertical partition')[0].qty).toBe(2);
    expect(row(list, 'Shelf').reduce((n, p) => n + p.qty, 0)).toBe(7);
    expect(row(list, 'Drawer front').reduce((n, p) => n + p.qty, 0)).toBe(2);
    expect(row(list, 'Hanging rail')[0].qty).toBe(1);
    expect(row(list, 'Hinged door').reduce((n, p) => n + p.qty, 0)).toBe(3);
    expect(countParts(list)).toBe(5 + 2 + 7 + 2 + 1 + 3);
  });

  it('describes every compartment by its shelf, drawer and rail heights', () => {
    const list = buildCutList(basic, catalog);
    expect(list.compartments[0]).toMatchObject({ number: 1, shelves: [400, 800, 1200, 1600], drawers: [], rails: [] });
    expect(list.compartments[2].drawers).toEqual([{ y: 0, height: 200 }, { y: 200, height: 200 }]);
    expect(list.compartments[1].rails).toEqual([1900]);
  });

  it('follows the design after an edit and handles sliding and no doors', () => {
    const wider = applyOps(basic, [{ op: 'update_dimensions', width: 2400 }], catalog);
    expect(buildCutList(wider, catalog).overall.width).toBe(2400);
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog);
    const slidingList = buildCutList(sliding, catalog);
    expect(row(slidingList, 'Sliding door panel')[0].qty).toBe(2);
    expect(row(slidingList, 'Sliding track')[0].qty).toBe(2);
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(row(buildCutList(none, catalog), 'Hinged door')).toEqual([]);
    expect(buildCutList(none, catalog).appearance.doors).toBe('No doors');
  });

  it('names catalog and custom appearances', () => {
    expect(describeAppearance(basic.carcass.appearance, catalog)).toBe('Melamine board, White, Matte');
    const custom = { material: { catalogId: 'melamine' }, color: { custom: true, name: 'Sage', hex: '#9caf88' }, finish: { catalogId: 'satin' } };
    expect(describeAppearance(custom, catalog)).toBe('Melamine board, Sage (custom), Satin');
  });
});
