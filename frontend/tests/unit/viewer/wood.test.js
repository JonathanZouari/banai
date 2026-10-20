import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { WOOD_COLOR_IDS, isWoodAppearance } from '../../../src/domain/catalog.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { createWoodTexture } from '../../../src/viewer/woodTexture.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const doors = (group) => group.children.filter((m) => m.isMesh && m.userData.kind === 'door');
const appearance = (color, material = 'melamine') => ({ material: { catalogId: material }, color: { catalogId: color }, finish: { catalogId: 'matte' } });

describe('wood tones', () => {
  it('lists only colours that exist in the catalog', () => {
    const ids = new Set(catalog.colors.map((c) => c.id));
    for (const id of WOOD_COLOR_IDS) expect(ids.has(id), id).toBe(true);
    expect(WOOD_COLOR_IDS.has('white')).toBe(false);
  });

  it('treats wood colours and oak veneer as wood, solid colours and custom colours as not', () => {
    expect(isWoodAppearance(appearance('teak'))).toBe(true);
    expect(isWoodAppearance(appearance('white', 'oak_veneer'))).toBe(true);
    expect(isWoodAppearance(appearance('white'))).toBe(false);
    expect(isWoodAppearance({ ...appearance('white'), color: { custom: true, name: 'Teak-ish', hex: '#a8693b' } })).toBe(false);
  });

  it('renders wood-tone doors with the grain texture tinted by the catalog colour', () => {
    const teak = catalog.colors.find((c) => c.id === 'teak');
    const design = applyOps(basic, [{ op: 'set_material', target: 'doors', material: { catalogId: 'oak_veneer' }, color: { catalogId: 'teak' } }], catalog);
    const group = buildWardrobe(design, createMaterials(catalog), { doorsVisible: true });
    for (const door of doors(group)) {
      expect(door.material.map?.userData.wood).toBe(true);
      expect(`#${door.material.color.getHexString()}`).toBe(teak.hex);
    }
    // The white melamine carcass stays a plain colour.
    expect(group.children.find((m) => m.userData.componentId === 'carcass').material.map).toBeNull();
  });

  it('shares one grain texture across all wood materials', () => {
    const materials = createMaterials(catalog);
    const a = materials.forAppearance(appearance('walnut'));
    const b = materials.forAppearance(appearance('wenge'));
    expect(a).not.toBe(b);
    expect(a.map).toBe(b.map);
  });

  it('builds a neutral, opaque grain with visible variation', () => {
    const { image } = createWoodTexture();
    const values = [];
    for (let i = 0; i < image.data.length; i += 4 * 97) {
      expect(image.data[i]).toBe(image.data[i + 1]); // grey: the material colour does the tinting
      expect(image.data[i + 3]).toBe(255);
      values.push(image.data[i]);
    }
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(20);
  });
});
