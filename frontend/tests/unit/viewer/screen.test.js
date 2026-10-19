// The sample flat screen (insert type 'tv'): 16:9 sizes, the default that leaves air beside it, and its mesh.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { defaultScreenInches, screenHeight, screenInches, screenWidth } from '../../../src/domain/defaults.js';
import { buildInserts, insertZone } from '../../../src/viewer/builders/inserts.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();

describe('the sample screen', () => {
  it('sizes a 16:9 screen from its diagonal, and back', () => {
    expect(screenHeight(43)).toBe(535);
    expect(screenWidth(535)).toBe(951);
    expect(screenInches(535)).toBe(43);
    expect(screenHeight(65)).toBe(809);
  });

  it('defaults to the largest screen up to 43" with 10 cm of air each side, at least 24" (as the server)', () => {
    expect(defaultScreenInches(643)).toBe(24);
    expect(defaultScreenInches(976)).toBe(35);
    expect(defaultScreenInches(2000)).toBe(43);
  });

  it('takes its height as an interior zone and is drawn as a body and a glass face on the back', () => {
    const basic = loadDesign('basic');
    const design = applyOps(basic, [{ op: 'add_insert', compartmentId: basic.compartments[1].id, type: 'tv', id: 'ins_tv' }], catalog);
    const screen = design.compartments[1].inserts.find((x) => x.type === 'tv');
    expect(screen.height).toBe(screenHeight(24));
    expect(insertZone(screen)).toEqual([screen.y, screen.y + screen.height]);
    const parts = buildInserts(design, frameOf(design), createMaterials(catalog)).filter((m) => m.userData.insertType === 'tv');
    expect(parts).toHaveLength(2);
    const size = new THREE.Box3().setFromObject(parts[0]).getSize(new THREE.Vector3());
    expect(Math.round(size.x * 1000)).toBe(screenWidth(screen.height));
    expect(Math.round(size.y * 1000)).toBe(screen.height);
  });
});
