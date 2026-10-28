import { describe, expect, it } from 'vitest';
import { diffDesigns, groupChanges, proposalChanges } from '../../../src/domain/diff.js';
import { deepFreeze } from '../../../src/domain/util.js';
import { loadCatalog, loadDesign } from './helpers.js';

const catalog = loadCatalog();
const basic = () => deepFreeze(loadDesign('basic'));
const diff = (ops, design = basic()) => proposalChanges(design, ops, catalog);
const pick = (changes, keys) => changes.map((change) => Object.fromEntries(keys.map((k) => [k, change[k]])));

describe('proposalChanges', () => {
  it('a dimension change: width 200 -> 240 cm, plus the rescaled compartments', () => {
    const changes = diff([{ op: 'update_dimensions', width: 2400 }]);
    expect(changes[0]).toMatchObject({ type: 'changed', group: { kind: 'wardrobe' }, subject: 'width', before: 2000, after: 2400, focus: ['carcass'] });
    expect(pick(changes.slice(1), ['subject', 'group'])).toEqual([1, 2, 3].map((index) => ({ subject: 'compartmentWidth', group: { kind: 'compartment', index } })));
  });

  it('an added component: two shelves in compartment 2 become one grouped row', () => {
    const changes = diff([
      { op: 'add_shelf', compartmentId: 'cmp_middle', y: 1200, id: 'shf_n2' },
      { op: 'add_shelf', compartmentId: 'cmp_middle', y: 800, id: 'shf_n1' },
    ]);
    expect(changes).toEqual([{
      type: 'added', group: { kind: 'compartment', index: 2 }, subject: 'shelf', count: 2, values: [800, 1200], focus: ['cmp_middle'],
    }]);
  });

  it('a removed component, with its position for the text', () => {
    expect(diff([{ op: 'remove_component', id: 'drw_r1' }])).toEqual([{
      type: 'removed', group: { kind: 'compartment', index: 3 }, subject: 'drawer', count: 1, values: [0], focus: ['drw_r1'],
    }]);
  });

  it('a moved component: the rail goes from 190 to 175 cm', () => {
    expect(diff([{ op: 'modify_rail', id: 'rail_m1', y: 1750 }])).toEqual([{
      type: 'moved', group: { kind: 'compartment', index: 2 }, subject: 'rail', before: 1900, after: 1750, focus: ['rail_m1'],
    }]);
  });

  it('material changes: wardrobe body and a single door override', () => {
    const changes = diff([
      { op: 'set_material', target: 'carcass', material: { catalogId: 'oak_veneer' } },
      { op: 'set_material', target: 'dr_middle', color: { catalogId: 'natural_oak' } },
    ]);
    expect(changes).toEqual([
      { type: 'changed', group: { kind: 'wardrobe' }, subject: 'material', target: { kind: 'carcass' }, before: { catalogId: 'melamine' }, after: { catalogId: 'oak_veneer' }, focus: ['carcass'] },
      { type: 'changed', group: { kind: 'doors' }, subject: 'color', target: { kind: 'door', index: 2 }, before: { catalogId: 'white' }, after: { catalogId: 'natural_oak' }, focus: ['dr_middle'] },
    ]);
  });

  it('several ops at once, ordered wardrobe, compartments left to right, then doors', () => {
    const changes = diff([
      { op: 'set_material', target: 'doors', color: { custom: true, name: 'Sage', hex: '#9caf88' } },
      { op: 'add_rail', compartmentId: 'cmp_right', y: 1800, id: 'rail_n1' },
      { op: 'update_dimensions', height: 2600 },
      { op: 'remove_component', id: 'shf_l1' },
    ]);
    expect(pick(changes, ['type', 'subject'])).toEqual([
      { type: 'changed', subject: 'height' },
      { type: 'removed', subject: 'shelf' },
      { type: 'added', subject: 'rail' },
      { type: 'changed', subject: 'color' },
    ]);
    expect(groupChanges(changes).map(({ group, changes: rows }) => [group, rows.length])).toEqual([
      [{ kind: 'wardrobe' }, 1], [{ kind: 'compartment', index: 1 }, 1], [{ kind: 'compartment', index: 3 }, 1], [{ kind: 'doors' }, 1],
    ]);
  });

  it('compartment numbers count left to right in the design, as in the editor', () => {
    const changes = diff([{ op: 'add_compartment', position: 0, width: 400, id: 'cmp_new' }]);
    expect(changes[0]).toMatchObject({ type: 'added', subject: 'compartment', index: 1, values: [400] });
    // The old left compartment is now number 2 and narrower.
    expect(changes[1]).toMatchObject({ subject: 'compartmentWidth', group: { kind: 'compartment', index: 2 } });
  });

  it('a removed compartment keeps its old number and focuses the part that exists now', () => {
    const changes = diff([{ op: 'remove_component', id: 'cmp_right' }]);
    expect(changes[0]).toMatchObject({ type: 'removed', subject: 'compartment', index: 3, focus: ['cmp_right'] });
  });

  it('a removed partition: items from the merged compartment are moved, not added', () => {
    const changes = diff([{ op: 'remove_component', id: 'prt_1' }]);
    const moved = changes.filter((c) => c.type === 'moved');
    expect(pick(moved, ['subject', 'count', 'from', 'group'])).toEqual([
      { subject: 'shelf', count: 1, from: 2, group: { kind: 'compartment', index: 1 } },
      { subject: 'rail', count: 1, from: 2, group: { kind: 'compartment', index: 1 } },
    ]);
    expect(changes.some((c) => c.type === 'added')).toBe(false);
  });

  it('door type and count', () => {
    const changes = diff([{ op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] }]);
    expect(pick(changes, ['subject', 'before', 'after'])).toEqual([
      { subject: 'doorType', before: 'hinged', after: 'sliding' },
      { subject: 'doorCount', before: 3, after: 2 },
    ]);
  });

  it('a new wardrobe (create_wardrobe) is one layout row, not every old part removed', () => {
    const changes = diff([{ op: 'create_wardrobe', width: 2400, height: 2400, depth: 600, compartmentCount: 4 }]);
    expect(changes.find((c) => c.subject === 'layout')).toMatchObject({ before: 3, after: 4 });
    expect(changes.some((c) => c.type === 'removed')).toBe(false);
  });

  it('no change gives an empty list', () => {
    expect(diff([{ op: 'update_dimensions', width: 2000 }])).toEqual([]);
    expect(diffDesigns(basic(), basic())).toEqual([]);
  });

  it('returns null without ops or when the engine rejects them', () => {
    expect(diff([])).toBeNull();
    expect(diff(undefined)).toBeNull();
    expect(diff([{ op: 'remove_component', id: 'shf_missing' }])).toBeNull();
  });

  it('never touches the design it was given (the saved design stays as it is)', () => {
    const design = loadDesign('basic');
    const copy = structuredClone(design);
    proposalChanges(design, [{ op: 'update_dimensions', width: 2400 }, { op: 'remove_component', id: 'shf_l1' }], catalog);
    expect(design).toEqual(copy);
  });
});
