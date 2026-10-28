import { describe, expect, it } from 'vitest';
import { TEMPLATES, BASIC_WARDROBE_OPS, basicWardrobe, buildTemplate } from '../../../src/domain/presets.js';
import { validateDesign } from '../../../src/domain/validation.js';
import { loadCatalog, loadDesign } from './helpers.js';

const catalog = loadCatalog();
// Template id -> the shared fixture holding the expected design (the backend is checked against the same files).
const fixtureName = (id) => (id === 'basic' ? 'basic' : `template_${id.replaceAll('-', '_')}`);

const lengths = (value, found = []) => {
  if (typeof value === 'number') found.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => lengths(child, found));
  return found;
};
const ids = (design) => [
  ...design.compartments.flatMap((c) => [c.id, ...c.shelves.map((s) => s.id), ...c.drawers.map((d) => d.id), ...c.rails.map((r) => r.id)]),
  ...design.partitions.map((p) => p.id),
  ...design.doors.items.map((d) => d.id),
];
const PREFIX = /^(cmp|prt|shf|drw|rail|dr)_[A-Za-z0-9_-]{1,40}$/;

describe('starting templates', () => {
  it('lists basic first, then the three new templates, with unique ids', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['basic', 'kids', 'double-sliding', 'minimalist']);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(3);
      expect(template.description.length).toBeGreaterThan(10);
      expect(Object.isFrozen(template.ops)).toBe(true);
    }
  });

  it('keeps the basic wardrobe exactly as it was', () => {
    expect(TEMPLATES[0].ops).toBe(BASIC_WARDROBE_OPS);
    expect(buildTemplate('basic', catalog)).toEqual(basicWardrobe(catalog));
  });

  for (const { id } of TEMPLATES) {
    describe(id, () => {
      const design = buildTemplate(id, catalog);

      it('is a valid design (validateDesign finds no issues)', () => {
        expect(validateDesign(design, catalog)).toEqual([]);
      });

      it('equals the shared fixture, so it matches the backend', () => {
        expect(design).toEqual(loadDesign(fixtureName(id)));
      });

      it('has unique, well-formed ids and integer lengths only', () => {
        const all = ids(design);
        expect(new Set(all).size).toBe(all.length);
        for (const value of all) expect(value).toMatch(PREFIX);
        for (const value of lengths(design.dimensions)) expect(Number.isInteger(value)).toBe(true);
        for (const value of lengths(design.compartments)) expect(Number.isInteger(value)).toBe(true);
      });

      it('is deterministic', () => {
        expect(buildTemplate(id, catalog)).toEqual(design);
      });
    });
  }

  it('the templates are different designs', () => {
    const designs = TEMPLATES.map((t) => JSON.stringify(buildTemplate(t.id, catalog)));
    expect(new Set(designs).size).toBe(designs.length);
  });

  it('each template has the shape its name promises', () => {
    const kids = buildTemplate('kids', catalog);
    expect(kids.dimensions.width).toBe(1500);
    expect(kids.compartments).toHaveLength(2);
    const double = buildTemplate('double-sliding', catalog);
    expect(double.doors.type).toBe('sliding');
    expect(double.doors.items).toHaveLength(3);
    const minimalist = buildTemplate('minimalist', catalog);
    expect(minimalist.compartments.flatMap((c) => c.shelves)).toHaveLength(3);
    expect(minimalist.compartments.flatMap((c) => c.drawers)).toHaveLength(0);
  });

  it('refuses an unknown template id', () => {
    expect(() => buildTemplate('nope', catalog)).toThrow(RangeError);
    expect(() => buildTemplate(undefined, catalog)).toThrow(RangeError);
  });

  it('never touches the frozen op lists', () => {
    for (const template of TEMPLATES) {
      const before = JSON.stringify(template.ops);
      buildTemplate(template.id, catalog);
      expect(JSON.stringify(template.ops)).toBe(before);
    }
  });
});
