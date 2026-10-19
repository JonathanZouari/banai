// A carcass on adjustable legs (carcass.base = 'legs'): a leg under each side and partition, front and back;
// the sides start above the legs and there is no plinth board. Matches the dossier (production/parts.py).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { LEG_INSET, legPositions } from '../../../src/viewer/builders/carcass.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // three compartments, two partitions
const onLegs = applyOps(basic, [{ op: 'set_fittings', base: 'legs' }, { op: 'update_dimensions', plinthHeight: 100 }], catalog);
const parts = (design, part) => buildWardrobe(design, createMaterials(catalog)).children.filter((m) => m.userData.part === part);

describe('a carcass on legs', () => {
  it('has a leg under each side and partition, front and back, as tall as the base', () => {
    const legs = parts(onLegs, 'leg');
    expect(legs).toHaveLength(2 * (basic.partitions.length + 2));
    const box = new THREE.Box3().setFromObject(legs[0]);
    expect(box.min.y * 1000).toBeCloseTo(0);
    expect(Math.round(box.max.y * 1000)).toBe(100);
    const frame = frameOf(onLegs);
    expect(legPositions(frame).map(([, z]) => z)).toContain(-LEG_INSET);
    expect(legPositions(frame).map(([, z]) => z)).toContain(-frame.depth + LEG_INSET);
  });

  it('starts the sides above the legs and drops the plinth board', () => {
    const [left] = parts(onLegs, 'left');
    expect(Math.round(new THREE.Box3().setFromObject(left).min.y * 1000)).toBe(100);
    expect(parts(onLegs, 'plinth')).toHaveLength(0);
    const onPlinth = applyOps(basic, [{ op: 'update_dimensions', plinthHeight: 100 }], catalog);
    expect(parts(onPlinth, 'plinth')).toHaveLength(1);
    expect(parts(onPlinth, 'leg')).toHaveLength(0);
    expect(new THREE.Box3().setFromObject(parts(onPlinth, 'left')[0]).min.y * 1000).toBeCloseTo(0);
  });

  it('soft close is on by default and can be switched off', () => {
    expect(basic.fittings).toEqual({ softClose: true });
    expect(applyOps(basic, [{ op: 'set_fittings', softClose: false }], catalog).fittings.softClose).toBe(false);
  });
});
