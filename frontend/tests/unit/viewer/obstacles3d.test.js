// Wall obstacles in 3D (viewer/obstacles3d.js): each type at its measured size, on the wall behind the carcass.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildObstacles, wallExtent } from '../../../src/viewer/obstacles3d.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // W 2000, D 600
const mm = (v) => Math.round(v * 1000);
const OBSTACLES = [
  { type: 'socket', x: 300, y: 300, width: 80, height: 80 },
  { type: 'switch', x: 2300, y: 1100, width: 80, height: 80 },
  { type: 'ac', x: 2200, y: 2000, width: 900, height: 300 },
  { type: 'pipe', x: -600, y: 0, width: 50, height: 2400 },
  { type: 'window', x: 2400, y: 900, width: 1000, height: 1200 },
  { type: 'panel', x: -1000, y: 0, width: 4000, height: 80 },
];

describe('obstacles in 3D', () => {
  const design = applyOps(basic, [{ op: 'set_site', obstacles: OBSTACLES }], catalog);
  const group = buildObstacles(design, design.dimensions.depth);

  it('draws each type on the wall at its measured width and height', () => {
    OBSTACLES.forEach((o) => {
      const item = group.getObjectByName(`obstacle-${o.type}`);
      const box = new THREE.Box3().setFromObject(item);
      const size = box.getSize(new THREE.Vector3());
      const extra = o.type === 'window' ? 80 : 0; // the sill reaches past the frame
      expect(mm(size.x)).toBeGreaterThanOrEqual(o.width - 1);
      expect(mm(size.x)).toBeLessThanOrEqual(o.width + extra + 1);
      expect(mm(box.min.y)).toBeLessThanOrEqual(o.y + 1);
      expect(mm(box.max.y)).toBeGreaterThanOrEqual(o.y + o.height - 1);
      expect(mm(box.min.z)).toBeGreaterThanOrEqual(-600 - 1); // never inside the wall
    });
    const pipe = new THREE.Box3().setFromObject(group.getObjectByName('obstacle-pipe')).getSize(new THREE.Vector3());
    expect(mm(pipe.y)).toBe(2400); // a tall, narrow pipe runs up the wall
  });

  it('puts a wall behind the wardrobe that reaches past every obstacle, and frees everything', () => {
    const { x0, x1 } = wallExtent(design, OBSTACLES);
    expect(x0).toBeLessThan(-1000);
    expect(x1).toBeGreaterThan(3400);
    expect(group.getObjectByName('wall')).toBeTruthy();
    expect(buildObstacles(basic, 600)).toBeNull();
    group.userData.dispose();
  });
});
