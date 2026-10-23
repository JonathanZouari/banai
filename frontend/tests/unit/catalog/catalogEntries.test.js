import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { parseCatalog } from '../../../src/domain/catalog.js';
import { basicWardrobe } from '../../../src/domain/presets.js';
import { materialOps } from '../../../src/editor/opsFromForm.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog } from '../domain/helpers.js';

// The catalog is owned by the backend (backend/app/domain/catalog.json); this reads that same file,
// so adding an entry there must keep the editor ops and the 3D materials in step.
const catalog = loadCatalog();
const design = basicWardrobe(catalog);
const NEW_COLOURS = { navy_blue: '1f3a5f', sage_green: '8a9a7b', terracotta: 'b5603f' };
const NEW_MATERIAL = 'birch_plywood';

describe('catalog entries', () => {
  it('parses, has unique ids and the new entries', () => {
    expect(() => parseCatalog(catalog)).not.toThrow();
    const ids = [...catalog.materials, ...catalog.colors, ...catalog.finishes].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.keys(NEW_COLOURS)) expect(catalog.colors.some((c) => c.id === id)).toBe(true);
    expect(catalog.materials.some((m) => m.id === NEW_MATERIAL)).toBe(true);
  });

  it('editor ops accept each new entry and still reject unknown ids', () => {
    for (const id of Object.keys(NEW_COLOURS)) {
      expect(applyOps(design, materialOps('carcass', 'color', { catalogId: id }), catalog).carcass.appearance.color).toEqual({ catalogId: id });
    }
    expect(applyOps(design, materialOps('doors', 'material', { catalogId: NEW_MATERIAL }), catalog).doors.appearance.material).toEqual({ catalogId: NEW_MATERIAL });
    expect(() => applyOps(design, materialOps('carcass', 'color', { catalogId: 'pink' }), catalog)).toThrow();
  });

  it('3D materials resolve the exact hex of each new colour', () => {
    const materials = createMaterials(catalog);
    for (const [id, hex] of Object.entries(NEW_COLOURS)) {
      const appearance = { material: { catalogId: NEW_MATERIAL }, color: { catalogId: id }, finish: { catalogId: 'matte' } };
      expect(materials.forAppearance(appearance).color.getHexString()).toBe(hex);
    }
  });
});
