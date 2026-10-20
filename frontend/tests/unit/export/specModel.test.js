import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildSpec } from '../../../src/export/specModel.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const now = new Date('2026-10-20T10:00:00Z');
const spec = (design = basic, options = {}) => buildSpec(design, catalog, { lang: 'en', unit: 'cm', now, ...options });
const value = (rows, label) => rows.find(([key]) => key === label)?.[1];

describe('buildSpec', () => {
  it('describes the basic wardrobe', () => {
    const s = spec();
    expect(s.overall).toBe('200.0 cm × 240.0 cm × 60.0 cm');
    expect(value(s.general, 'Interior size (clear, W × H)')).toBe('196.4 cm × 236.4 cm');
    expect(value(s.general, 'Panel thickness')).toBe('1.8 cm');
    expect(value(s.general, 'Compartments')).toBe('3');
    expect(value(s.general, 'Shelves')).toBe('7');
    expect(value(s.general, 'Drawers')).toBe('2');
    expect(value(s.general, 'Hanging rails')).toBe('1');
    expect(value(s.general, 'Doors')).toBe('3 hinged doors');
  });

  it('lists compartment items with their heights from the base', () => {
    const s = spec();
    expect(s.compartments.map((c) => c.width)).toEqual(['64.3 cm', '64.3 cm', '64.2 cm']);
    expect(s.compartments[0].items.map((i) => [i.label, i.position])).toEqual([
      ['Shelf 1', '40.0 cm'], ['Shelf 2', '80.0 cm'], ['Shelf 3', '120.0 cm'], ['Shelf 4', '160.0 cm'],
    ]);
    const right = s.compartments[2].items;
    expect(right.find((i) => i.label === 'Drawer 2').position).toBe('20.0 cm – 40.0 cm');
    expect(s.compartments[1].items.find((i) => i.kind === 'rails')).toMatchObject({ label: 'Hanging rail 1', position: '190.0 cm', finish: '–' });
  });

  it('resolves finishes by catalog name and follows the inheritance rule', () => {
    const s = spec();
    expect(s.materials[0]).toEqual(['Carcass and interior', 'Melamine board, White, Matte']);
    expect(s.compartments[0].items[0].finish).toBe('Melamine board, White, Matte');
    expect(s.overrides).toEqual([]);
    const custom = applyOps(basic, [{ op: 'set_material', target: 'shf_l1', material: { catalogId: 'oak_veneer' }, color: { catalogId: 'natural_oak' }, finish: { catalogId: 'satin' } }], catalog);
    const c = spec(custom);
    expect(c.compartments[0].items[0].finish).toBe('Oak veneer, Natural oak, Satin');
    expect(c.overrides).toEqual([['No. 1 · Shelf 1', 'Oak veneer, Natural oak, Satin']]);
  });

  it('describes hinged doors, hinge sides and mirror fronts', () => {
    const mirrored = applyOps(basic, [{ op: 'modify_door', id: 'dr_left', front: 'mirror' }], catalog);
    const s = spec(mirrored);
    expect(s.doors.rows.map((r) => [r.name, r.covers, r.hinge, r.front])).toEqual([
      ['Door 1', '1', 'Left', 'Mirror'], ['Door 2', '2', 'Right', 'Panel'], ['Door 3', '3', 'Left', 'Panel'],
    ]);
  });

  it('handles sliding doors and designs without doors', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] }], catalog);
    const s = spec(sliding);
    expect(s.doors.sliding).toBe(true);
    expect(value(s.general, 'Doors')).toBe('2 sliding panels');
    expect(s.doors.rows.every((r) => r.hinge === '–')).toBe(true);
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    const n = spec(none);
    expect(n.doors.empty).toBe(true);
    expect(value(n.general, 'Doors')).toBe('No doors');
    expect(value(n.hardware, 'Handles')).toBe('0');
  });

  it('counts handles and names the hardware', () => {
    const s = spec();
    expect(value(s.hardware, 'Handle style')).toBe('Bar');
    expect(value(s.hardware, 'Handle finish')).toBe('Black');
    expect(value(s.hardware, 'Handles')).toBe('3');
    const noHandles = applyOps(basic, [{ op: 'set_handles', style: 'none' }], catalog);
    expect(value(spec(noHandles).hardware, 'Handles')).toBe('0');
  });

  it('follows the unit and the language', () => {
    expect(spec(basic, { unit: 'in' }).overall).toBe('78.74 in × 94.49 in × 23.62 in');
    const he = spec(basic, { lang: 'he' });
    expect(he.dir).toBe('rtl');
    expect(he.title).toBe('מפרט תכנון ארון');
    expect(he.materials[0][1]).toBe('לוח מלמין, לבן, מט');
  });

  it('gives a stable document number and a file name', () => {
    const a = spec();
    expect(a.docNo).toMatch(/^BAI-20261020-[0-9A-F]{6}$/);
    expect(spec().docNo).toBe(a.docNo);
    expect(spec(applyOps(basic, [{ op: 'update_dimensions', width: 2100 }], catalog)).docNo).not.toBe(a.docNo);
    expect(a.fileName).toBe('BanAI-wardrobe-2000x2400x600-20261020.pdf');
  });

  it('never claims the design is manufacturable and has no parts list', () => {
    const s = spec();
    const text = JSON.stringify(s).toLowerCase();
    expect(s.notes.join(' ')).toMatch(/not a manufacturing document/i);
    expect(text).not.toMatch(/cut list|parts list|cutting list/);
  });
});
