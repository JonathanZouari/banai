// Plinth (schema v2): the bottom panel sits on the plinth and every interior y starts on top of it.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { PLINTH_RECESS } from '../../../src/viewer/builders/carcass.js';
import { frameOf } from '../../../src/viewer/builders/frame.js';
import { selectionAnchor } from '../../../src/viewer/dimensions.js';
import { compartmentBox } from '../../../src/viewer/highlight.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { buildProps, disposeProps } from '../../../src/viewer/props.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const PLINTH = 100;
const raised = applyOps(basic, [{ op: 'update_dimensions', plinthHeight: PLINTH }], catalog);
const build = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: true });
const part = (group, name) => group.children.find((m) => m.userData.part === name);
const byId = (group, id) => group.children.find((m) => m.userData.componentId === id);
const bounds = (mesh) => new THREE.Box3().setFromObject(mesh);
const mm = (m) => Math.round(m * 1e4) / 10 + 0; // + 0: no -0

describe('frameOf with a plinth', () => {
  it('starts the interior on the bottom panel, which sits on the plinth', () => {
    const frame = frameOf(raised);
    expect(frame.plinth).toBe(PLINTH);
    expect(frame.baseY).toBe(PLINTH + 18);
    expect(frame.innerHeight).toBe(2400 - 2 * 18 - PLINTH);
    expect(frameOf(basic)).toMatchObject({ plinth: 0, baseY: 18, innerHeight: 2364 });
  });

  it('treats a v1 object without plinthHeight as no plinth', () => {
    const v1 = structuredClone(basic);
    delete v1.carcass.plinthHeight;
    expect(frameOf(v1)).toMatchObject({ plinth: 0, baseY: 18 });
  });
});

describe('carcass with a plinth', () => {
  const group = build(raised);

  it('keeps the sides full height and lifts the bottom panel onto the plinth', () => {
    const left = bounds(part(group, 'left'));
    expect([mm(left.min.y), mm(left.max.y)]).toEqual([0, 2400]);
    const bottom = bounds(part(group, 'bottom'));
    expect([mm(bottom.min.y), mm(bottom.max.y)]).toEqual([PLINTH, PLINTH + 18]);
    const top = bounds(part(group, 'top'));
    expect([mm(top.min.y), mm(top.max.y)]).toEqual([2382, 2400]);
  });

  it('fills the back between bottom and top panels', () => {
    const back = bounds(part(group, 'back'));
    expect([mm(back.min.y), mm(back.max.y)]).toEqual([PLINTH + 18, 2382]);
  });

  it('adds a plinth board between the sides, recessed 30 mm behind the front', () => {
    const plinth = part(group, 'plinth');
    expect(plinth.userData).toMatchObject({ componentId: 'carcass', kind: 'carcass' });
    const box = bounds(plinth);
    expect([mm(box.min.x), mm(box.max.x)]).toEqual([18, 1982]);
    expect([mm(box.min.y), mm(box.max.y)]).toEqual([0, PLINTH]);
    expect(mm(box.max.z)).toBe(-PLINTH_RECESS);
    expect(PLINTH_RECESS).toBe(30);
  });

  it('draws no plinth board without a plinth', () => {
    expect(part(build(basic), 'plinth')).toBeUndefined();
    expect(build(basic).children.filter((m) => m.userData.kind === 'carcass')).toHaveLength(5);
  });
});

describe('interior items with a plinth', () => {
  const flat = build(basic);
  const group = build(raised);
  const lift = (id) => mm(byId(group, id).position.y - byId(flat, id).position.y);

  it('moves shelves, drawers and rails up by the plinth', () => {
    ['shf_l1', 'shf_m1', 'drw_r1', 'rail_m1'].forEach((id) => expect(lift(id)).toBe(PLINTH));
    expect(mm(byId(group, 'shf_l1').position.y)).toBe(PLINTH + 18 + 400 + 9);
  });

  it('keeps partitions exactly between the bottom and top panels', () => {
    const partition = bounds(byId(group, 'prt_1'));
    expect([mm(partition.min.y), mm(partition.max.y)]).toEqual([PLINTH + 18, 2382]);
  });

  it('highlights and labels a compartment over its interior only', () => {
    const volume = compartmentBox(raised, 1);
    expect([mm(volume.min.x), mm(volume.max.x)]).toEqual([679, 1322]);
    expect([mm(volume.min.y), mm(volume.max.y)]).toEqual([PLINTH + 18, 2382]);
    expect(compartmentBox(raised, 3)).toBeNull();
    const anchor = selectionAnchor(group, raised, { id: 'cmp_middle', kind: 'compartment' });
    expect(mm(anchor.y)).toBe((PLINTH + 18 + 2382) / 2);
  });

  it('puts the decorative clothes on the raised interior', () => {
    const props = buildProps(raised, { seed: 7 });
    const hangers = props.children.filter((m) => m.userData.part === 'hanger');
    expect(hangers.length).toBeGreaterThan(0);
    hangers.forEach((hanger) => expect(mm(hanger.position.y)).toBe(PLINTH + 18 + 1900)); // on rail_m1
    props.children.filter((m) => m.userData.part === 'stack').forEach((stack) => {
      expect(bounds(stack).min.y).toBeGreaterThanOrEqual((PLINTH + 18 + 400 + 18) / 1000 - 1e-9); // on a shelf, never below the lowest
    });
    disposeProps(props);
  });
});
