import { describe, expect, it } from 'vitest';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();
const appearance = (color) => ({ material: { catalogId: 'melamine' }, color: { catalogId: color }, finish: { catalogId: 'matte' } });

describe('createMaterials', () => {
  it.each([
    ['olive_green', '6b6f45'],
    ['navy_blue', '2c3e55'],
    ['terracotta', 'b5654a'],
  ])('paints %s with its catalog colour', (id, hex) => {
    expect(createMaterials(catalog).forAppearance(appearance(id)).color.getHexString()).toBe(hex);
  });

  it('offers solid oak as a material', () => {
    expect(catalog.materials.map((m) => m.id)).toContain('solid_oak');
  });
});
