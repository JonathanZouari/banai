import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateWardrobe } from '../../../src/domain/presets.js';
import { validateDesign } from '../../../src/domain/validation.js';
import { loadCatalog } from './helpers.js';

const catalog = loadCatalog();

describe('template presets', () => {
  for (const tmpl of TEMPLATES) {
    it(`template "${tmpl.id}" produces a valid design`, () => {
      const design = templateWardrobe(tmpl.id, catalog);
      const issues = validateDesign(design, catalog);
      expect(issues).toEqual([]);
    });
  }

  it('throws for unknown template id', () => {
    expect(() => templateWardrobe('nonexistent', catalog)).toThrow('Unknown template');
  });
});
