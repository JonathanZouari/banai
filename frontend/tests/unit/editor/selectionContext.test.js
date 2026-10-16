import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { deepFreeze } from '../../../src/domain/util.js';
import { describeSelection } from '../../../src/editor/selectionContext.js';
import { resolveSelection } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
// basic: 3 compartments (cmp_left 4 shelves; cmp_middle 1 shelf + 1 rail; cmp_right 2 shelves + 2 drawers),
// partitions prt_1 / prt_2 and one hinged door per compartment.
const basic = deepFreeze(loadDesign('basic'));
const two = deepFreeze(loadDesign('two'));

const NONE = { compartmentId: null, text: '' };
const select = (design, id) => resolveSelection(design, id);
const describe_ = (design, id) => describeSelection(design, select(design, id));
const ops = (design, list) => deepFreeze(applyOps(design, list, catalog));
const clone = (design) => structuredClone(design);

describe('describeSelection: the default design', () => {
  it('numbers shelves bottom-up within their compartment', () => {
    expect(describe_(basic, 'shf_l1')).toEqual({ compartmentId: 'cmp_left', text: 'Compartment 1 · Shelf 1 of 4' });
    expect(describe_(basic, 'shf_l2')).toEqual({ compartmentId: 'cmp_left', text: 'Compartment 1 · Shelf 2 of 4' });
    expect(describe_(basic, 'shf_l4')).toEqual({ compartmentId: 'cmp_left', text: 'Compartment 1 · Shelf 4 of 4' });
    expect(describe_(basic, 'shf_m1')).toEqual({ compartmentId: 'cmp_middle', text: 'Compartment 2 · Shelf 1 of 1' });
    expect(describe_(basic, 'shf_r2')).toEqual({ compartmentId: 'cmp_right', text: 'Compartment 3 · Shelf 2 of 2' });
  });

  it('numbers drawers bottom-up within their compartment', () => {
    expect(describe_(basic, 'drw_r1')).toEqual({ compartmentId: 'cmp_right', text: 'Compartment 3 · Drawer 1 of 2' });
    expect(describe_(basic, 'drw_r2')).toEqual({ compartmentId: 'cmp_right', text: 'Compartment 3 · Drawer 2 of 2' });
  });

  it('describes a lone rail without a count', () => {
    expect(describe_(basic, 'rail_m1')).toEqual({ compartmentId: 'cmp_middle', text: 'Compartment 2 · Rail' });
  });

  it('describes a compartment by its position and highlights itself', () => {
    expect(describe_(basic, 'cmp_left')).toEqual({ compartmentId: 'cmp_left', text: 'Compartment 1 of 3' });
    expect(describe_(basic, 'cmp_right')).toEqual({ compartmentId: 'cmp_right', text: 'Compartment 3 of 3' });
  });

  it('describes a partition by the compartments it separates (no row to highlight)', () => {
    expect(describe_(basic, 'prt_1')).toEqual({ compartmentId: null, text: 'Between compartments 1 and 2' });
    expect(describe_(basic, 'prt_2')).toEqual({ compartmentId: null, text: 'Between compartments 2 and 3' });
  });

  it('describes a hinged door by the compartment it covers', () => {
    expect(describe_(basic, 'dr_left')).toEqual({ compartmentId: 'cmp_left', text: 'Covers compartment 1' });
    expect(describe_(basic, 'dr_middle')).toEqual({ compartmentId: 'cmp_middle', text: 'Covers compartment 2' });
    expect(describe_(basic, 'dr_right')).toEqual({ compartmentId: 'cmp_right', text: 'Covers compartment 3' });
  });

  it('describes the carcass as the wardrobe body', () => {
    expect(describe_(basic, 'carcass')).toEqual({ compartmentId: null, text: 'Wardrobe body' });
  });

  it('works on the second fixture', () => {
    expect(describe_(two, 'shf_1').text).toBe('Compartment 1 · Shelf 1 of 1');
    expect(describe_(two, 'drw_1').text).toBe('Compartment 1 · Drawer 1 of 1');
    expect(describe_(two, 'rail_1').text).toBe('Compartment 2 · Rail');
    expect(describe_(two, 'prt_ab').text).toBe('Between compartments 1 and 2');
    expect(describe_(two, 'dr_b')).toEqual({ compartmentId: 'cmp_b', text: 'Covers compartment 2' });
  });
});

describe('describeSelection: ordering', () => {
  it('orders by height, not by array position', () => {
    const shuffled = clone(basic);
    shuffled.compartments[0].shelves.reverse(); // array order is now l4, l3, l2, l1
    expect(describeSelection(shuffled, { id: 'shf_l1', kind: 'shelf' }).text).toBe('Compartment 1 · Shelf 1 of 4');
    expect(describeSelection(shuffled, { id: 'shf_l4', kind: 'shelf' }).text).toBe('Compartment 1 · Shelf 4 of 4');
    const drawers = clone(basic);
    drawers.compartments[2].drawers.reverse();
    expect(describeSelection(drawers, { id: 'drw_r1', kind: 'drawer' }).text).toBe('Compartment 3 · Drawer 1 of 2');
  });

  it('breaks height ties by array order', () => {
    const tied = clone(basic);
    tied.compartments[0].shelves.forEach((shelf) => { shelf.y = 500; });
    expect(describeSelection(tied, { id: 'shf_l1', kind: 'shelf' }).text).toBe('Compartment 1 · Shelf 1 of 4');
    expect(describeSelection(tied, { id: 'shf_l3', kind: 'shelf' }).text).toBe('Compartment 1 · Shelf 3 of 4');
    tied.compartments[2].drawers.forEach((drawer) => { drawer.y = 0; });
    expect(describeSelection(tied, { id: 'drw_r2', kind: 'drawer' }).text).toBe('Compartment 3 · Drawer 2 of 2');
  });

  it('counts rails when a compartment has several', () => {
    const racks = ops(basic, [{ op: 'add_rail', compartmentId: 'cmp_middle', y: 1000, id: 'rail_low' }]);
    expect(describe_(racks, 'rail_low')).toEqual({ compartmentId: 'cmp_middle', text: 'Compartment 2 · Rail 1 of 2' });
    expect(describe_(racks, 'rail_m1')).toEqual({ compartmentId: 'cmp_middle', text: 'Compartment 2 · Rail 2 of 2' });
  });

  it('follows the current design when compartments are added or removed', () => {
    const fewer = ops(basic, [{ op: 'remove_component', id: 'cmp_left' }]);
    expect(describe_(fewer, 'shf_m1').text).toBe('Compartment 1 · Shelf 1 of 1');
    expect(describe_(fewer, 'cmp_right').text).toBe('Compartment 2 of 2');
    expect(describe_(fewer, 'dr_middle').text).toBe('Covers compartment 1');
    const more = ops(basic, [{ op: 'add_compartment', position: 0, width: 200, id: 'cmp_new' }]);
    expect(describe_(more, 'shf_l2').text).toBe('Compartment 2 · Shelf 2 of 4');
    expect(describe_(more, 'cmp_new')).toEqual({ compartmentId: 'cmp_new', text: 'Compartment 1 of 4' });
  });
});

describe('describeSelection: doors', () => {
  const wide = (compartmentIds) => ops(basic, [{
    op: 'configure_doors',
    type: 'hinged',
    doors: [
      { id: 'dr_wide', compartmentIds, hingeSide: 'left' },
      ...['cmp_left', 'cmp_middle', 'cmp_right'].filter((id) => !compartmentIds.includes(id))
        .map((id) => ({ id: `dr_${id}`, compartmentIds: [id], hingeSide: 'right' })),
    ],
  }]);

  it('describes a door spanning several compartments by its first one', () => {
    const pair = wide(['cmp_left', 'cmp_middle']);
    expect(describe_(pair, 'dr_wide')).toEqual({ compartmentId: 'cmp_left', text: 'Covers compartments 1–2' });
    expect(describe_(pair, 'dr_cmp_right')).toEqual({ compartmentId: 'cmp_right', text: 'Covers compartment 3' });
    expect(describe_(wide(['cmp_middle', 'cmp_right']), 'dr_wide')).toEqual({ compartmentId: 'cmp_middle', text: 'Covers compartments 2–3' });
    expect(describe_(wide(['cmp_left', 'cmp_middle', 'cmp_right']), 'dr_wide').text).toBe('Covers compartments 1–3');
  });

  it('lists compartments that are not adjacent instead of a range', () => {
    const gap = clone(basic);
    gap.doors.items[0].compartmentIds = ['cmp_left', 'cmp_right']; // invalid for the engine; the helper stays total
    expect(describeSelection(gap, { id: 'dr_left', kind: 'door' })).toEqual({ compartmentId: 'cmp_left', text: 'Covers compartments 1, 3' });
  });

  it('describes sliding doors (which cover no compartment) by position', () => {
    const sliding = ops(basic, [{ op: 'configure_doors', type: 'sliding', count: 3, ids: ['dr_s1', 'dr_s2', 'dr_s3'] }]);
    expect(describe_(sliding, 'dr_s1')).toEqual({ compartmentId: null, text: 'Door 1 of 3' });
    expect(describe_(sliding, 'dr_s3')).toEqual({ compartmentId: null, text: 'Door 3 of 3' });
  });

  it('falls back to the door position when it references no known compartment', () => {
    const orphan = clone(basic);
    orphan.doors.items[1].compartmentIds = ['cmp_gone'];
    expect(describeSelection(orphan, { id: 'dr_middle', kind: 'door' })).toEqual({ compartmentId: null, text: 'Door 2 of 3' });
  });
});

describe('describeSelection: nothing to describe', () => {
  it('returns an empty description without a selection', () => {
    expect(describeSelection(basic, null)).toEqual(NONE);
    expect(describeSelection(basic, undefined)).toEqual(NONE);
    expect(describeSelection(basic, {})).toEqual(NONE);
  });

  it('returns an empty description for an unknown id of any kind', () => {
    ['shelf', 'drawer', 'rail', 'compartment', 'partition', 'door', 'carcass'].forEach((kind) => {
      expect(describeSelection(basic, { id: 'nope_1', kind }), kind).toEqual(NONE);
    });
  });

  it('returns an empty description when the kind does not match the id', () => {
    expect(describeSelection(basic, { id: 'shf_l2', kind: 'drawer' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 'drw_r1', kind: 'shelf' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 'cmp_left', kind: 'door' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 'dr_left', kind: 'partition' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 'prt_1', kind: 'compartment' })).toEqual(NONE);
  });

  it('returns an empty description for malformed input', () => {
    expect(describeSelection(basic, { id: 'shf_l2', kind: 'wheel' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 'shf_l2', kind: 'toString' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 42, kind: 'shelf' })).toEqual(NONE);
    expect(describeSelection(basic, { id: 'x', kind: 'carcass' })).toEqual(NONE);
    expect(describeSelection(null, { id: 'shf_l2', kind: 'shelf' })).toEqual(NONE);
    expect(describeSelection({}, { id: 'shf_l2', kind: 'shelf' })).toEqual(NONE);
  });

  it('never shares or mutates its result or the design', () => {
    const before = JSON.stringify(basic);
    const first = describeSelection(basic, null);
    first.text = 'changed';
    expect(describeSelection(basic, null)).toEqual(NONE);
    describeSelection(basic, { id: 'shf_l2', kind: 'shelf' }); // basic is deep-frozen: a mutation would throw
    expect(JSON.stringify(basic)).toBe(before);
  });
});
