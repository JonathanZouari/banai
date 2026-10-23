import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { parseCatalog } from '../../../src/domain/catalog.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

// The catalog file is the single source: every colour in it must reach the right 3D surfaces.
const catalog = loadCatalog();
const basic = loadDesign('basic');
const NEW_COLOURS = { olive_green: '#6b7a47', dusty_blue: '#6f8aa3' };

const meshes = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true }).children.filter((c) => c.isMesh);
const colourOf = (mesh) => `#${mesh.material.color.getHexString()}`;
const ofId = (design, id) => meshes(design).filter((m) => m.userData.componentId === id);
const paint = (target, catalogId) => applyOps(basic, [{ op: 'set_material', target, color: { catalogId } }], catalog);

describe('catalog colours in the 3D view', () => {
  it('the frontend accepts the catalog, including the new entries', () => {
    const parsed = parseCatalog(catalog);
    expect(Object.fromEntries(parsed.colors.map((c) => [c.id, c.hex]))).toMatchObject(NEW_COLOURS);
    expect(parsed.materials.map((m) => m.id)).toContain('solid_wood');
  });

  // Runs for every colour in the catalog, so existing colours are covered too (regression).
  it.each(catalog.colors.map((c) => [c.id, c.hex]))('%s recolours exactly the carcass when set on the carcass', (id, hex) => {
    const design = paint('carcass', id);
    const carcass = ofId(design, 'carcass');
    expect(carcass.length).toBeGreaterThan(0);
    carcass.forEach((mesh) => expect(colourOf(mesh)).toBe(hex));
    // shelves inherit the carcass appearance, doors keep their own
    ofId(design, 'shf_l1').forEach((mesh) => expect(colourOf(mesh)).toBe(hex));
    ofId(design, 'dr_left').forEach((mesh) => expect(colourOf(mesh)).toBe(catalog.colors.find((c) => c.id === 'white').hex));
  });

  it.each(Object.entries(NEW_COLOURS))('%s on the doors recolours the doors and not the carcass', (id, hex) => {
    const design = paint('doors', id);
    ['dr_left', 'dr_middle', 'dr_right'].forEach((doorId) => {
      const door = ofId(design, doorId);
      expect(door.length).toBeGreaterThan(0);
      door.forEach((mesh) => expect(colourOf(mesh)).toBe(hex));
    });
    ofId(design, 'carcass').forEach((mesh) => expect(colourOf(mesh)).toBe('#f2f1ed'));
  });

  it('a shelf override changes only that shelf', () => {
    const design = paint('shf_l1', 'olive_green');
    ofId(design, 'shf_l1').forEach((mesh) => expect(colourOf(mesh)).toBe(NEW_COLOURS.olive_green));
    ofId(design, 'shf_l2').forEach((mesh) => expect(colourOf(mesh)).toBe('#f2f1ed'));
  });

  it('the new material is accepted and keeps the colour and finish', () => {
    const design = applyOps(basic, [{ op: 'set_material', target: 'carcass', material: { catalogId: 'solid_wood' } }], catalog);
    expect(design.carcass.appearance.material).toEqual({ catalogId: 'solid_wood' });
    expect(design.carcass.appearance.color).toEqual(basic.carcass.appearance.color);
  });
});
