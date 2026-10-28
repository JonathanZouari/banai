import { describe, expect, it } from 'vitest';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();
const appearance = (color, material = 'melamine') => ({
  material: { catalogId: material },
  color: { catalogId: color },
  finish: { catalogId: 'matte' },
});

describe('createMaterials', () => {
  it.each([
    ['sage_green', '8f9e83'],
    ['navy_blue', '2b3a52'],
    ['sand_beige', 'd9c8ad'],
  ])('renders the catalog colour %s from its hex', (id, hex) => {
    const material = createMaterials(catalog).forAppearance(appearance(id, 'birch_plywood'));
    expect(material.color.getHexString()).toBe(hex);
  });

  it.each([
    ['olive_green', '6b6f45'],
    ['terracotta', 'b5654a'],
  ])('paints %s with its catalog colour', (id, hex) => {
    expect(createMaterials(catalog).forAppearance(appearance(id)).color.getHexString()).toBe(hex);
  });

  it('offers both birch plywood and solid oak as materials', () => {
    expect(catalog.materials.map((m) => m.id)).toEqual(expect.arrayContaining(['birch_plywood', 'solid_oak']));
  });
});
