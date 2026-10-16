import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRAINS } from '../../../src/domain/catalog.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { WOOD_GRAINS, createWoodTexture } from '../../../src/viewer/woodTexture.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const wood = (colorId, material = 'melamine') => ({ material: { catalogId: material }, color: { catalogId: colorId }, finish: { catalogId: 'matte' } });

describe('wood texture', () => {
  it('covers every catalog grain', () => {
    expect([...WOOD_GRAINS].sort()).toEqual([...GRAINS].sort());
  });

  it.each(WOOD_GRAINS)('%s is deterministic, greyscale, near-white and tileable-configured', (grain) => {
    const a = createWoodTexture(grain, { size: 64 });
    const b = createWoodTexture(grain, { size: 64 });
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
    let min = 255;
    let sum = 0;
    for (let i = 0; i < a.image.data.length; i += 4) {
      const [r, g, bl, alpha] = a.image.data.slice(i, i + 4);
      expect(r === g && g === bl && alpha === 255).toBe(true);
      min = Math.min(min, r);
      sum += r;
    }
    expect(min / 255).toBeGreaterThanOrEqual(0.77);
    expect(sum / (a.image.data.length / 4) / 255).toBeGreaterThan(0.85);
    expect(a.wrapS).toBe(THREE.RepeatWrapping);
    expect(a.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(a.generateMipmaps).toBe(true);
  });

  it('differs between grains and between seeds', () => {
    const oak = createWoodTexture('oak', { size: 64 });
    expect(Array.from(createWoodTexture('walnut', { size: 64 }).image.data)).not.toEqual(Array.from(oak.image.data));
    expect(Array.from(createWoodTexture('oak', { size: 64, seed: 5 }).image.data)).not.toEqual(Array.from(oak.image.data));
  });

  it('rejects an unknown grain', () => {
    expect(() => createWoodTexture('plastic')).toThrow(RangeError);
  });
});

describe('wood materials', () => {
  it('shares one texture per grain, keeps the catalog colour, and leaves plain colours untextured', () => {
    const materials = createMaterials(catalog);
    const natural = materials.forAppearance(wood('natural_oak'));
    const light = materials.forAppearance(wood('light_oak'));
    const walnut = materials.forAppearance(wood('walnut'));
    expect(natural.map).toBeTruthy();
    expect(natural.map).toBe(light.map);
    expect(walnut.map).not.toBe(natural.map);
    expect(walnut.color.getHexString()).toBe('6b4a32');
    expect(natural.metalness).toBe(0);
    expect(materials.forAppearance(wood('white')).map).toBeNull();
    expect(materials.forAppearance(wood('white', 'oak_veneer')).map).toBe(natural.map); // veneer defaults to oak
    materials.dispose();
  });

  it('disposes grain textures with the materials', () => {
    const materials = createMaterials(catalog);
    const texture = materials.forAppearance(wood('teak')).map;
    let disposed = false;
    texture.addEventListener('dispose', () => { disposed = true; });
    materials.dispose();
    expect(disposed).toBe(true);
  });

  it('gives box UVs in metres without moving the geometry', () => {
    const group = buildWardrobe(loadDesign('basic'), createMaterials(catalog), { doorsVisible: true });
    const left = group.children.find((m) => m.userData.part === 'left');
    const uv = left.geometry.getAttribute('uv');
    expect(uv.count).toBe(24);
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(1); // 2.4 m along the grain
    left.geometry.computeBoundingBox();
    expect(left.geometry.boundingBox.getSize(new THREE.Vector3()).y).toBeCloseTo(2.4, 6);
  });
});
