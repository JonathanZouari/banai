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
    expect(describe_(basic, 'shf_l1')).toEqual({ compartmentId: 'cmp_left', text: 'תא 1 · מדף 1 מתוך 4' });
    expect(describe_(basic, 'shf_l2')).toEqual({ compartmentId: 'cmp_left', text: 'תא 1 · מדף 2 מתוך 4' });
    expect(describe_(basic, 'shf_l4')).toEqual({ compartmentId: 'cmp_left', text: 'תא 1 · מדף 4 מתוך 4' });
    expect(describe_(basic, 'shf_m1')).toEqual({ compartmentId: 'cmp_middle', text: 'תא 2 · מדף 1 מתוך 1' });
    expect(describe_(basic, 'shf_r2')).toEqual({ compartmentId: 'cmp_right', text: 'תא 3 · מדף 2 מתוך 2' });
  });

  it('numbers drawers bottom-up within their compartment', () => {
    expect(describe_(basic, 'drw_r1')).toEqual({ compartmentId: 'cmp_right', text: 'תא 3 · מגירה 1 מתוך 2' });
    expect(describe_(basic, 'drw_r2')).toEqual({ compartmentId: 'cmp_right', text: 'תא 3 · מגירה 2 מתוך 2' });
  });

  it('describes a lone rail without a count', () => {
    expect(describe_(basic, 'rail_m1')).toEqual({ compartmentId: 'cmp_middle', text: 'תא 2 · מוט' });
  });

  it('describes a compartment by its position and highlights itself', () => {
    expect(describe_(basic, 'cmp_left')).toEqual({ compartmentId: 'cmp_left', text: 'תא 1 מתוך 3' });
    expect(describe_(basic, 'cmp_right')).toEqual({ compartmentId: 'cmp_right', text: 'תא 3 מתוך 3' });
  });

  it('describes a partition by the compartments it separates (no row to highlight)', () => {
    expect(describe_(basic, 'prt_1')).toEqual({ compartmentId: null, text: 'בין תא 1 לתא 2' });
    expect(describe_(basic, 'prt_2')).toEqual({ compartmentId: null, text: 'בין תא 2 לתא 3' });
  });

  it('describes a hinged door by the compartment it covers', () => {
    expect(describe_(basic, 'dr_left')).toEqual({ compartmentId: 'cmp_left', text: 'מכסה את תא 1' });
    expect(describe_(basic, 'dr_middle')).toEqual({ compartmentId: 'cmp_middle', text: 'מכסה את תא 2' });
    expect(describe_(basic, 'dr_right')).toEqual({ compartmentId: 'cmp_right', text: 'מכסה את תא 3' });
  });

  it('describes the carcass as the wardrobe body', () => {
    expect(describe_(basic, 'carcass')).toEqual({ compartmentId: null, text: 'גוף הארון' });
  });

  it('works on the second fixture', () => {
    expect(describe_(two, 'shf_1').text).toBe('תא 1 · מדף 1 מתוך 1');
    expect(describe_(two, 'drw_1').text).toBe('תא 1 · מגירה 1 מתוך 1');
    expect(describe_(two, 'rail_1').text).toBe('תא 2 · מוט');
    expect(describe_(two, 'prt_ab').text).toBe('בין תא 1 לתא 2');
    expect(describe_(two, 'dr_b')).toEqual({ compartmentId: 'cmp_b', text: 'מכסה את תא 2' });
  });
});

describe('describeSelection: ordering', () => {
  it('orders by height, not by array position', () => {
    const shuffled = clone(basic);
    shuffled.compartments[0].shelves.reverse(); // array order is now l4, l3, l2, l1
    expect(describeSelection(shuffled, { id: 'shf_l1', kind: 'shelf' }).text).toBe('תא 1 · מדף 1 מתוך 4');
    expect(describeSelection(shuffled, { id: 'shf_l4', kind: 'shelf' }).text).toBe('תא 1 · מדף 4 מתוך 4');
    const drawers = clone(basic);
    drawers.compartments[2].drawers.reverse();
    expect(describeSelection(drawers, { id: 'drw_r1', kind: 'drawer' }).text).toBe('תא 3 · מגירה 1 מתוך 2');
  });

  it('breaks height ties by array order', () => {
    const tied = clone(basic);
    tied.compartments[0].shelves.forEach((shelf) => { shelf.y = 500; });
    expect(describeSelection(tied, { id: 'shf_l1', kind: 'shelf' }).text).toBe('תא 1 · מדף 1 מתוך 4');
    expect(describeSelection(tied, { id: 'shf_l3', kind: 'shelf' }).text).toBe('תא 1 · מדף 3 מתוך 4');
    tied.compartments[2].drawers.forEach((drawer) => { drawer.y = 0; });
    expect(describeSelection(tied, { id: 'drw_r2', kind: 'drawer' }).text).toBe('תא 3 · מגירה 2 מתוך 2');
  });

  it('counts rails when a compartment has several', () => {
    const racks = ops(basic, [{ op: 'add_rail', compartmentId: 'cmp_middle', y: 1000, id: 'rail_low' }]);
    expect(describe_(racks, 'rail_low')).toEqual({ compartmentId: 'cmp_middle', text: 'תא 2 · מוט 1 מתוך 2' });
    expect(describe_(racks, 'rail_m1')).toEqual({ compartmentId: 'cmp_middle', text: 'תא 2 · מוט 2 מתוך 2' });
  });

  it('follows the current design when compartments are added or removed', () => {
    const fewer = ops(basic, [{ op: 'remove_component', id: 'cmp_left' }]);
    expect(describe_(fewer, 'shf_m1').text).toBe('תא 1 · מדף 1 מתוך 1');
    expect(describe_(fewer, 'cmp_right').text).toBe('תא 2 מתוך 2');
    expect(describe_(fewer, 'dr_middle').text).toBe('מכסה את תא 1');
    const more = ops(basic, [{ op: 'add_compartment', position: 0, width: 200, id: 'cmp_new' }]);
    expect(describe_(more, 'shf_l2').text).toBe('תא 2 · מדף 2 מתוך 4');
    expect(describe_(more, 'cmp_new')).toEqual({ compartmentId: 'cmp_new', text: 'תא 1 מתוך 4' });
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
    expect(describe_(pair, 'dr_wide')).toEqual({ compartmentId: 'cmp_left', text: 'מכסה את תאים 1–2' });
    expect(describe_(pair, 'dr_cmp_right')).toEqual({ compartmentId: 'cmp_right', text: 'מכסה את תא 3' });
    expect(describe_(wide(['cmp_middle', 'cmp_right']), 'dr_wide')).toEqual({ compartmentId: 'cmp_middle', text: 'מכסה את תאים 2–3' });
    expect(describe_(wide(['cmp_left', 'cmp_middle', 'cmp_right']), 'dr_wide').text).toBe('מכסה את תאים 1–3');
  });

  it('lists compartments that are not adjacent instead of a range', () => {
    const gap = clone(basic);
    gap.doors.items[0].compartmentIds = ['cmp_left', 'cmp_right']; // invalid for the engine; the helper stays total
    expect(describeSelection(gap, { id: 'dr_left', kind: 'door' })).toEqual({ compartmentId: 'cmp_left', text: 'מכסה את תאים 1, 3' });
  });

  it('describes sliding doors (which cover no compartment) by position', () => {
    const sliding = ops(basic, [{ op: 'configure_doors', type: 'sliding', count: 3, ids: ['dr_s1', 'dr_s2', 'dr_s3'] }]);
    expect(describe_(sliding, 'dr_s1')).toEqual({ compartmentId: null, text: 'דלת 1 מתוך 3' });
    expect(describe_(sliding, 'dr_s3')).toEqual({ compartmentId: null, text: 'דלת 3 מתוך 3' });
  });

  it('falls back to the door position when it references no known compartment', () => {
    const orphan = clone(basic);
    orphan.doors.items[1].compartmentIds = ['cmp_gone'];
    expect(describeSelection(orphan, { id: 'dr_middle', kind: 'door' })).toEqual({ compartmentId: null, text: 'דלת 2 מתוך 3' });
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
