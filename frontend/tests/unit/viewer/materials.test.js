import { describe, expect, it } from 'vitest';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog } from '../domain/helpers.js';

const appearance = (color) => ({ material: { catalogId: 'melamine' }, color, finish: { catalogId: 'matte' } });

describe('createMaterials', () => {
  const materials = createMaterials(loadCatalog());

  it.each([
    ['olive_green', '6b6f45'],
    ['navy_blue', '2c3e55'],
    ['terracotta', 'b5654a'],
  ])('resolves catalog colour %s to its hex', (catalogId, hex) => {
    expect(materials.forAppearance(appearance({ catalogId })).color.getHexString()).toBe(hex);
  });

  it('falls back to neutral grey for an unknown catalog colour', () => {
    expect(materials.forAppearance(appearance({ catalogId: 'no_such_colour' })).color.getHexString()).toBe('b8b8b8');
  });
});
