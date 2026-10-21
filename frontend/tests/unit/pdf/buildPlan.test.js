import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildPlan, pdfText } from '../../../src/pdf/buildPlan.js';
import { catalog, design } from './fixtures.js';

describe('buildPlan', () => {
  it('lists overall sizes, carcass panels and numbered steps for the default wardrobe', () => {
    const plan = buildPlan(design, catalog);
    expect(plan.overall).toMatchObject({ width: 2000, height: 2400, depth: 600, interiorWidth: 1964 });
    const sides = plan.parts.find((p) => p.part === 'Side panel');
    expect(sides).toMatchObject({ qty: 2, length: 2400, width: 600, thickness: 18 });
    expect(plan.parts.find((p) => p.part === 'Top panel').length).toBe(1964);
    expect(plan.steps.length).toBeGreaterThan(4);
    expect(plan.steps.at(-1)).toMatch(/Final check/);
  });

  it('has one partition part per partition and shelf/rail/drawer rows for added items', () => {
    const withItems = applyOps(design, [
      { op: 'add_shelf', compartmentId: design.compartments[0].id, y: 2000 },
      { op: 'add_rail', compartmentId: design.compartments[1].id, y: 1700 },
      { op: 'add_drawer', compartmentId: design.compartments[0].id, y: 0, height: 200 },
    ], catalog);
    const plan = buildPlan(withItems, catalog);
    expect(plan.parts.filter((p) => p.part.startsWith('Partition'))).toHaveLength(design.partitions.length);
    expect(plan.parts.some((p) => p.part.startsWith('Shelf'))).toBe(true);
    expect(plan.parts.some((p) => p.part.startsWith('Hanging rail') && p.note.includes('1700'))).toBe(true);
    expect(plan.parts.some((p) => p.part.startsWith('Drawer front'))).toBe(true);
  });

  it('door widths cover their compartments, and sliding panels split the width', () => {
    const plan = buildPlan(design, catalog);
    const door = plan.parts.find((p) => p.part === 'Hinged door 1');
    expect(door.width).toBeGreaterThan(0);
    const sliding = buildPlan(applyOps(design, [{ op: 'configure_doors', type: 'sliding', count: 2 }], catalog), catalog);
    expect(sliding.parts.filter((p) => p.part.startsWith('Sliding door'))).toHaveLength(2);
    const none = buildPlan(applyOps(design, [{ op: 'configure_doors', type: 'none' }], catalog), catalog);
    expect(none.parts.some((p) => p.part.includes('door'))).toBe(false);
  });

  it('never mentions prices, payment or claims manufacturability', () => {
    const text = JSON.stringify(buildPlan(design, catalog)).toLowerCase();
    expect(text).not.toMatch(/price|payment|\$|usd|eur|ready for manufactur/);
  });

  it('replaces characters the PDF fonts cannot draw', () => {
    expect(pdfText('Sage שלום')).toBe('Sage ????');
  });
});

describe('buildPlan languages', () => {
  const numbers = (plan) => plan.parts.map(({ key, qty, length, width, thickness }) => [key, qty, length, width, thickness]);

  it('prints identical sizes and quantities in Hebrew and English', () => {
    const he = buildPlan(design, catalog, 'he');
    const en = buildPlan(design, catalog, 'en');
    expect(numbers(he)).toEqual(numbers(en));
    expect(he.steps).toHaveLength(en.steps.length);
    expect(he.overall).toEqual(en.overall);
  });

  it('uses Hebrew words, including Hebrew catalog names, and no question-mark replacements', () => {
    const he = buildPlan(design, catalog, 'he');
    expect(he.parts[0].part).toBe('דופן צד');
    expect(he.carcassLook).toBe('לוח מלמין, לבן, מט');
    expect(JSON.stringify(he)).not.toContain('?');
    expect(he.steps.at(-1)).toMatch(/בדיקה סופית/);
  });

  it('keeps a custom colour name as typed and falls back to the English catalog name for unknown ids', () => {
    const custom = structuredClone(design);
    custom.carcass.appearance.color = { custom: true, name: 'ירוק מרווה', hex: '#9caf88' };
    expect(buildPlan(custom, catalog, 'he').carcassLook).toContain('ירוק מרווה (מותאם אישית)');
    const extended = { ...catalog, colors: [...catalog.colors, { id: 'teal', name: 'Teal', hex: '#008080' }] };
    const teal = structuredClone(design);
    teal.carcass.appearance.color = { catalogId: 'teal' };
    expect(buildPlan(teal, extended, 'he').carcassLook).toContain('Teal');
  });
});
