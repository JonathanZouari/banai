import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { addItemOps } from '../../../src/editor/opsFromForm.js';
import { describeSelection } from '../../../src/viewer/format.js';
import { buildWardrobe } from '../../../src/viewer/buildWardrobe.js';
import { createMaterials } from '../../../src/viewer/materials.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const build = (design) => buildWardrobe(design, createMaterials(catalog), { doorsVisible: false });
const parts = (group, part) => group.children.filter((o) => o.userData.part === part);

describe('pull-down rail (wardrobe lift)', () => {
  it('loads rails saved without a type as fixed', () => {
    const legacy = structuredClone(basic);
    legacy.compartments.forEach((c) => c.rails.forEach((r) => { delete r.type; }));
    const canonical = applyOps(legacy, [], catalog);
    expect(canonical.compartments[1].rails[0].type).toBe('fixed');
    expect(canonical).toEqual(basic);
  });

  it('is placed near the top of the largest free gap of the chosen compartment', () => {
    const [op] = addItemOps(basic, 'cmp_left', 'pulldown');
    expect(op).toMatchObject({ op: 'add_rail', compartmentId: 'cmp_left', type: 'pulldown' });
    const next = applyOps(basic, [op], catalog);
    const rail = next.compartments[0].rails[0];
    expect(rail.type).toBe('pulldown');
    expect(rail.y).toBe(op.y);
    // A plain rail from the same button row stays fixed.
    expect(addItemOps(basic, 'cmp_left', 'rail')[0].type).toBeUndefined();
  });

  it('draws a lift mechanism that clicks pass through; a fixed rail has none', () => {
    const fixedOnly = build(basic);
    expect(parts(fixedOnly, 'lift-arm')).toHaveLength(0);

    const design = applyOps(basic, [{ op: 'add_rail', compartmentId: 'cmp_left', y: 2000, id: 'rail_lift', type: 'pulldown' }], catalog);
    const group = build(design);
    expect(parts(group, 'lift-arm')).toHaveLength(2);
    expect(parts(group, 'lift-plate')).toHaveLength(2);
    expect(parts(group, 'lift-pull')).toHaveLength(1);
    const hits = [];
    [...parts(group, 'lift-arm'), ...parts(group, 'lift-plate'), ...parts(group, 'lift-pull')]
      .forEach((mesh) => mesh.raycast({}, hits));
    expect(hits).toEqual([]); // hardware never steals a click
    const rail = group.children.find((o) => o.userData.componentId === 'rail_lift');
    expect(rail.userData).toMatchObject({ kind: 'rail', railType: 'pulldown' });
  });

  it('can be switched between fixed and pull-down, and is described as such', () => {
    const store = createStore({ design: basic, revision: 1, catalog });
    expect(store.dispatch([{ op: 'modify_rail', id: 'rail_m1', type: 'pulldown' }]).ok).toBe(true);
    const { design } = store.getState();
    expect(design.compartments[1].rails[0]).toMatchObject({ y: 1900, type: 'pulldown' });
    expect(describeSelection(design, { id: 'rail_m1', kind: 'rail' })).toMatch(/^Pull-down rail/);
    expect(store.dispatch([{ op: 'modify_rail', id: 'rail_m1' }]).ok).toBe(false);
  });
});
