import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMaterials, GRAIN_MATERIALS, resolveColor } from '../../../src/viewer/materials.js';
import { loadCatalog } from '../domain/helpers.js';

const catalog = loadCatalog();
const appearance = (material, color, finish = 'matte') => ({
  material: { catalogId: material }, color: { catalogId: color }, finish: { catalogId: finish },
});

describe('catalog colours and materials in the viewer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders olive green with its catalog hex', () => {
    expect(resolveColor({ catalogId: 'olive_green' }, catalog)).toBe('#6b6b3a');
    expect(createMaterials(catalog).forAppearance(appearance('melamine', 'olive_green')).color.getHexString()).toBe('6b6b3a');
  });

  it('solid oak gets a wood grain in the browser; other materials keep a plain colour', () => {
    expect(GRAIN_MATERIALS.has('solid_oak')).toBe(true);
    const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }) };
    vi.stubGlobal('document', { createElement: () => canvas });
    const materials = createMaterials(catalog);
    const oak = materials.forAppearance(appearance('solid_oak', 'olive_green'));
    expect(oak.map).not.toBeNull();
    expect(oak.color.getHexString()).toBe('ffffff'); // the grain texture carries the colour
    const melamine = materials.forAppearance(appearance('melamine', 'olive_green'));
    expect(melamine.map).toBeNull();
    expect(melamine.color.getHexString()).toBe('6b6b3a');
    materials.dispose();
  });

  it('without a DOM (no canvas) solid oak falls back to its plain colour', () => {
    const oak = createMaterials(catalog).forAppearance(appearance('solid_oak', 'walnut'));
    expect(oak.map).toBeNull();
    expect(oak.color.getHexString()).toBe('6b4a32');
  });
});
