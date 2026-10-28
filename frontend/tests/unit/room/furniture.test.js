import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../../../src/room/catalog.js';
import { buildFurniture, createFurnitureMaterials, FURNITURE_KINDS } from '../../../src/room/furniture.js';

const materials = createFurnitureMaterials();

describe('furniture pieces', () => {
  it('there is a builder for every catalog piece', () => {
    expect([...FURNITURE_KINDS].sort()).toEqual(Object.keys(FURNITURE).sort());
  });

  for (const kind of Object.keys(FURNITURE)) {
    it(`${kind}: few draw calls, and its size matches its catalog footprint`, () => {
      const group = buildFurniture(kind, materials);
      expect(group.children.length).toBeLessThanOrEqual(kind === 'doubleBed' ? 6 : 5); // one merged mesh per material
      const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
      const { width, depth, height } = FURNITURE[kind];
      expect(size.x * 1000).toBeLessThanOrEqual(width + 20);
      expect(size.z * 1000).toBeLessThanOrEqual(depth + 20);
      expect(Math.abs(size.y * 1000 - height)).toBeLessThanOrEqual(60);
    });
  }
});
