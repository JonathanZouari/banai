import { describe, expect, it } from 'vitest';
import { BASIC_WARDROBE_OPS, buildTemplate, TEMPLATE_OPS } from '../../../src/domain/presets.js';
import { validateDesign } from '../../../src/domain/validation.js';
import { loadCatalog, loadDesign } from './helpers.js';

const catalog = loadCatalog();
const fixtureName = (id) => (id === 'basic' ? 'basic' : `template_${id}`);

describe('starting templates', () => {
  it('lists the basic wardrobe first, then kids, double and minimalist', () => {
    expect(Object.keys(TEMPLATE_OPS)).toEqual(['basic', 'kids', 'double', 'minimal']);
    expect(TEMPLATE_OPS.basic).toBe(BASIC_WARDROBE_OPS);
  });

  for (const id of Object.keys(TEMPLATE_OPS)) {
    it(`${id}: passes validateDesign and equals its shared fixture (parity with the backend)`, () => {
      const design = buildTemplate(id, catalog);
      expect(validateDesign(design, catalog)).toEqual([]);
      expect(design).toEqual(loadDesign(fixtureName(id)));
    });

    it(`${id}: its op list is frozen and starts with create_wardrobe`, () => {
      expect(Object.isFrozen(TEMPLATE_OPS[id])).toBe(true);
      expect(Object.isFrozen(TEMPLATE_OPS[id][0])).toBe(true);
      expect(TEMPLATE_OPS[id][0].op).toBe('create_wardrobe');
    });
  }

  it('templates are distinct designs', () => {
    const sizes = Object.keys(TEMPLATE_OPS).map((id) => JSON.stringify(buildTemplate(id, catalog).dimensions));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('an unknown template id throws', () => {
    expect(() => buildTemplate('toString', catalog)).toThrow('Unknown template');
    expect(() => buildTemplate('castle', catalog)).toThrow('Unknown template');
  });
});
