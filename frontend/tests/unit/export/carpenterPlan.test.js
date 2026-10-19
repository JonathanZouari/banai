import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { ASSUMED_CONSTRUCTION, appearanceName, buildCarpenterPlan } from '../../../src/export/carpenterPlan.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const row = (plan, part) => plan.cutList.find((r) => r.part === part);
const strip = ({ part, ...rest }) => rest;

describe('buildCarpenterPlan: cut list', () => {
  const plan = buildCarpenterPlan(basic, catalog, 'en');
  const carcass = 'Melamine board / White / Matte';

  it('derives carcass panels from the outer size and panel thickness', () => {
    expect(strip(row(plan, 'Side panel'))).toEqual({ qty: 2, length: 2400, width: 600, thickness: 18, material: carcass });
    expect(strip(row(plan, 'Top / bottom'))).toEqual({ qty: 2, length: 1964, width: 600, thickness: 18, material: carcass });
    expect(strip(row(plan, 'Back panel'))).toEqual({ qty: 1, length: 2364, width: 1964, thickness: ASSUMED_CONSTRUCTION.backThickness, material: carcass });
  });

  it('lists partitions and merges identical shelves per compartment', () => {
    expect(strip(row(plan, 'Partition 1'))).toEqual({ qty: 1, length: 2364, width: 594, thickness: 18, material: carcass });
    expect(row(plan, 'Partition 2')).toBeDefined();
    expect(row(plan, 'Shelf, compartment 1')).toMatchObject({ qty: 4, length: 643, width: 594 });
    expect(row(plan, 'Shelf, compartment 2')).toMatchObject({ qty: 1, length: 643 });
    expect(row(plan, 'Shelf, compartment 3')).toMatchObject({ qty: 2, length: 642 });
  });

  it('sizes drawer fronts, rails and hinged doors with the assumed gaps', () => {
    expect(row(plan, 'Drawer front, compartment 3')).toMatchObject({ qty: 2, length: 636, width: 194 });
    expect(row(plan, 'Hanging rail, compartment 2')).toMatchObject({ qty: 1, length: 643, width: null });
    expect(row(plan, 'Door 1 (hinge left)')).toMatchObject({ length: 2360, width: 639, thickness: 18 });
    expect(row(plan, 'Door 2 (hinge right)')).toMatchObject({ width: 639 });
    expect(row(plan, 'Door 3 (hinge left)')).toMatchObject({ width: 638 });
  });

  it('sizes sliding panels with the overlap, and lists no doors for type none', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 3 }], catalog);
    const panels = buildCarpenterPlan(sliding, catalog, 'en').cutList.filter((r) => r.part.startsWith('Sliding panel'));
    expect(panels).toHaveLength(3);
    expect(panels[0]).toMatchObject({ length: 2360, width: 695 });
    const none = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(buildCarpenterPlan(none, catalog, 'en').cutList.some((r) => /door|Sliding/i.test(r.part))).toBe(false);
  });

  it('handles a design with a different panel thickness', () => {
    const two = buildCarpenterPlan(loadDesign('two'), catalog, 'en');
    expect(row(two, 'Top / bottom')).toMatchObject({ length: 960, thickness: 20 });
    expect(row(two, 'Shelf, compartment 1')).toMatchObject({ length: 470, thickness: 20 });
  });
});

describe('buildCarpenterPlan: steps, drawing and language', () => {
  it('places partitions from the inner face of the left side', () => {
    const { steps } = buildCarpenterPlan(basic, catalog, 'en');
    expect(steps).toContain('Fix partition 1 with its left face 643 from the inner face of the left side.');
    expect(steps).toContain('Fix partition 2 with its left face 1304 from the inner face of the left side.');
    expect(steps.at(-1)).toMatch(/Compare/);
  });

  it('gives the front elevation in outer coordinates', () => {
    const { drawing } = buildCarpenterPlan(basic, catalog, 'en');
    expect(drawing).toMatchObject({ width: 2000, height: 2400, panel: 18 });
    expect(drawing.compartments[0]).toMatchObject({ x0: 18, x1: 661, width: 643 });
    expect(drawing.compartments[0].shelves[0]).toEqual({ y: 418, thickness: 18 });
    expect(drawing.partitions[0]).toEqual({ x: 661, thickness: 18 });
  });

  it('localizes to Hebrew (RTL) by default, and English on request', () => {
    const he = buildCarpenterPlan(basic, catalog);
    expect(he).toMatchObject({ language: 'he', dir: 'rtl', title: 'הוראות לנגר' });
    expect(he.cutList[0].part).toBe('דופן צד');
    expect(he.disclaimer).toMatch(/לא נבדק להיתכנות/);
    const en = buildCarpenterPlan(basic, catalog, 'en');
    expect(en).toMatchObject({ language: 'en', dir: 'ltr' });
    expect(en.disclaimer).toMatch(/Not checked for manufacturing/);
    expect(buildCarpenterPlan(basic, catalog, 'xx').language).toBe('he');
  });

  it('never changes the design', () => {
    const before = JSON.stringify(basic);
    buildCarpenterPlan(basic, catalog, 'en');
    expect(JSON.stringify(basic)).toBe(before);
  });

  it('shows custom appearance names as given, and unknown catalog ids by id', () => {
    const appearance = { material: { custom: true, name: 'Birch ply', hex: null }, color: { catalogId: 'nope' }, finish: { catalogId: 'gloss' } };
    expect(appearanceName(appearance, catalog)).toBe('Birch ply / nope / Gloss');
  });
});
