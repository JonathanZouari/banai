import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../../src/chat/i18n.js';
import { buildTemplate, TEMPLATE_OPS } from '../../../src/domain/presets.js';
import { measure, TEMPLATE_GUIDE, templateAlt, templateFeatures, templateSize } from '../../../src/entry/templates.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();
const ids = Object.keys(TEMPLATE_OPS);
const design = (id) => buildTemplate(id, catalog);

// ASSUMPTION: prototype ergonomics for the templates we ship (not app rules, never shown as warnings).
const HANGER_HOOK = 60; // room above a rail for hanger hooks, mm
const SHELF_GAP = 250; // usable height between horizontal parts, mm

describe('templates are comfortable to use (checked from the designs)', () => {
  for (const id of ids) {
    it(`${id}: room above every rail, enough free hanging below it, shelves not too close`, () => {
      const minHanging = id === 'kids' ? TEMPLATE_GUIDE.childHanging : TEMPLATE_GUIDE.shortHanging;
      for (const compartment of measure(design(id))) {
        for (const rail of compartment.rails) {
          expect(rail.roomAbove, `${rail.id} hook room`).toBeGreaterThanOrEqual(HANGER_HOOK);
          expect(rail.freeBelow, `${rail.id} free hanging`).toBeGreaterThanOrEqual(minHanging);
        }
        compartment.gaps.forEach((gap) => expect(gap, `${compartment.id} gap`).toBeGreaterThanOrEqual(SHELF_GAP));
      }
    });
  }

  it("kids: every rail and shelf is within a child's reach", () => {
    for (const compartment of measure(design('kids'))) {
      compartment.rails.forEach((rail) => expect(rail.fromFloor).toBeLessThanOrEqual(TEMPLATE_GUIDE.childReach));
      compartment.shelfTops.forEach((top) => expect(top).toBeLessThanOrEqual(TEMPLATE_GUIDE.childReach));
    }
  });

  it('double: one long-hanging rail and a double short-hanging compartment', () => {
    const [left, right] = measure(design('double'));
    expect(left.rails[0].freeBelow).toBeGreaterThanOrEqual(TEMPLATE_GUIDE.longHanging);
    expect(right.rails.map((r) => r.freeBelow)).toEqual([950, 1000]);
  });
});

describe('card text', () => {
  it('feature chips come from the design', () => {
    expect(Object.fromEntries(ids.map((id) => [id, templateFeatures(design(id))]))).toEqual({
      basic: ['hinged', 'long', 'drawers'],
      kids: ['child', 'hinged', 'drawers'],
      double: ['sliding', 'long', 'double'],
      minimal: ['hinged', 'long'],
    });
  });

  it('every feature, template and language has its words', () => {
    for (const { start } of Object.values(STRINGS)) {
      ids.forEach((id) => expect(start.templates[id].name && start.templates[id].story).toBeTruthy());
      ids.flatMap((id) => templateFeatures(design(id))).forEach((key) => expect(start.features[key]).toBeTruthy());
    }
  });

  it('size chip: width × height × depth, whole centimetres without ".0"', () => {
    expect(templateSize(design('kids'), STRINGS.en.start)).toBe('100 × 150 × 50 cm');
    expect(templateSize(design('double'), STRINGS.he.start)).toBe('220 × 240 × 65 ס״מ');
  });

  it('screen readers get what the thumbnail shows, in English and Hebrew', () => {
    expect(templateAlt(design('kids'), STRINGS.en.start)).toBe(
      '3D preview: a 100 × 150 × 50 cm wardrobe with 2 compartments, hinged doors, 1 hanging rail, 4 shelves and 1 drawer.',
    );
    expect(templateAlt(design('kids'), STRINGS.he.start)).toBe(
      'תצוגה תלת־ממדית: ארון 100 × 150 × 50 ס״מ עם 2 תאים, דלתות ציר, מוט תלייה אחד, 4 מדפים ומגירה אחת.',
    );
    expect(templateAlt(design('double'), STRINGS.he.start)).toBe(
      'תצוגה תלת־ממדית: ארון 220 × 240 × 65 ס״מ עם 2 תאים, דלתות הזזה, 3 מוטות תלייה ו־2 מדפים.',
    );
  });
});
