import { describe, expect, it } from 'vitest';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog } from '../domain/helpers.js';

const appearance = (color, material = 'melamine') => ({
  material: { catalogId: material },
  color: { catalogId: color },
  finish: { catalogId: 'matte' },
});

describe('createMaterials', () => {
  it.each([
    ['sage', '9caf88'],
    ['navy', '2f3e55'],
    ['sand', 'd6c7ae'],
  ])('renders the catalog colour %s from its hex', (id, hex) => {
    const material = createMaterials(loadCatalog()).forAppearance(appearance(id, 'birch_plywood'));
    expect(material.color.getHexString()).toBe(hex);
  });
});
