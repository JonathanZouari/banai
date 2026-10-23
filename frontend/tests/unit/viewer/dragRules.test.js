// Drag rules (viewer/dragRules.js, ADR-039): straight lines, limits, snaps, and the op a drop sends.
import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { alongAxis, dragSpec, nudge, settle, targetForSelection } from '../../../src/viewer/dragRules.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // 2000 x 2400 x 600, shelves at 400/800/1200/1600 in cmp_left
const apply = (design, ops) => applyOps(design, ops, catalog);
const roomed = apply(basic, [{ op: 'set_room', shape: { kind: 'rect', width: 4000, depth: 4000 } }]); // offset 1000

describe('settling a value', () => {
  it('lands on whole centimetres, takes a snap point within 2 cm, and stays inside its limits', () => {
    expect(settle(1234, [0, 3000])).toBe(1230);
    expect(settle(1488, [0, 3000], [1500])).toBe(1500);
    expect(settle(1470, [0, 3000], [1500])).toBe(1470);
    expect(settle(-80, [0, 3000])).toBe(0);
    expect(settle(9000, [0, 3000], [9000])).toBe(3000); // a snap outside the limits is ignored
  });

  it('reads movement along an axis from the pointer ray, and none when looking along it', () => {
    // A ray from (0, 0, 5) toward -z passing x = 0.3: along the x axis through the origin that is 0.3.
    expect(alongAxis([0.3, 0, 5], [0, 0, -1], [0, 0, 0], [1, 0, 0])).toBeCloseTo(0.3);
    expect(alongAxis([0, 0, 5], [0, 0, -1], [0, 0, 0], [0, 0, 1])).toBeNull();
  });
});

describe('what moves and how', () => {
  it('the wardrobe moves along its wall only with a room, between the corners', () => {
    expect(dragSpec(basic, { kind: 'wardrobe' })).toBeNull();
    const spec = dragSpec(roomed, { kind: 'wardrobe' });
    expect(spec.axes).toEqual([{ key: 'x', value: 1000, limits: [0, 2000], snaps: [0, 50, 1000, 1950, 2000] }]);
    expect(spec.ops({ x: 1000 })).toBeNull();
    expect(apply(roomed, spec.ops({ x: 50 })).room.offset).toBe(50);
    expect(spec.label({ x: 50 })).toBe('5 ס״מ מתחילת הקיר · 195 ס״מ עד סופו');
  });

  it('a shelf moves up and down between its neighbours', () => {
    const spec = dragSpec(basic, { kind: 'item', id: 'shf_l2' }); // at 800, between 400 (+18) and 1200
    expect(spec.axes).toHaveLength(1);
    expect(spec.axes[0]).toMatchObject({ key: 'y', value: 800, limits: [418, 1182] });
    expect(apply(basic, spec.ops({ y: 1182 })).compartments[0].shelves[1].y).toBe(1182);
  });

  it('a drawer and a rail keep clear of what is around them', () => {
    const drawer = dragSpec(basic, { kind: 'item', id: 'drw_r2' }); // 200 high at 200, on drw_r1, under shf_r1 (800)
    expect(drawer.axes[0].limits).toEqual([200, 600]);
    const rail = dragSpec(basic, { kind: 'item', id: 'rail_m1' }); // a line at 1900, under shf_m1 (2000)
    expect(rail.axes[0].limits).toEqual([0, 2000]);
  });

  it('a partition moves left and right, leaving each compartment at least 5 cm', () => {
    const spec = dragSpec(basic, { kind: 'partition', id: 'prt_1' });
    expect(spec.axes[0]).toMatchObject({ key: 'x', value: 643, limits: [50, 1236], snaps: [643] });
    const moved = apply(basic, spec.ops({ x: 743 }));
    expect(moved.compartments.map((c) => c.width).slice(0, 2)).toEqual([743, 543]);
  });

  it('obstacles stay on the wall: skirting only along the floor, the rest both ways, within the wall', () => {
    const design = apply(roomed, [{ op: 'set_site', obstacles: [
      { type: 'socket', x: 300, y: 300, width: 80, height: 80 }, { type: 'panel', x: -500, y: 0, width: 3000, height: 80 }] }]);
    const socket = dragSpec(design, { kind: 'obstacle', index: 0 });
    expect(socket.axes.map((a) => a.key)).toEqual(['x', 'y']);
    expect(socket.axes[0].limits).toEqual([-1000, 2920]); // the wall's start to its end, less the socket
    expect(socket.axes[1].limits).toEqual([0, 2520]); // floor to the 2.6 m default ceiling
    expect(dragSpec(design, { kind: 'obstacle', index: 1 }).axes.map((a) => a.key)).toEqual(['x']);
    const ops = socket.ops({ y: 900 });
    expect(apply(design, ops).site.obstacles[0]).toMatchObject({ x: 300, y: 900 });
    expect(apply(design, ops).site.obstacles[1]).toMatchObject({ type: 'panel', x: -500 });
  });

  it('openings move along their wall; a window also up and down', () => {
    const design = apply(roomed, [{ op: 'set_room', openings: [
      { type: 'door', wall: 2, at: 500, width: 900, height: 2100, hinge: 'left', swing: 'in' },
      { type: 'window', wall: 1, at: 1000, width: 1200, height: 1200, sill: 900 }] }]);
    const door = dragSpec(design, { kind: 'opening', index: 0 });
    expect(door.axes).toEqual([{ key: 'x', value: 500, limits: [0, 3100], snaps: [0, 1550, 3100] }]);
    const windowSpec = dragSpec(design, { kind: 'opening', index: 1 });
    expect(windowSpec.axes.map((a) => a.key)).toEqual(['x', 'y']);
    expect(apply(design, windowSpec.ops({ y: 1000 })).room.openings[1]).toMatchObject({ at: 1000, sill: 1000 });
  });

  it('the selection names the target; the arrows nudge it 1 cm, Shift 10 cm, within its limits', () => {
    expect(targetForSelection(basic, { kind: 'door', id: 'dr_left' })).toEqual({ kind: 'wardrobe' });
    expect(targetForSelection(basic, { kind: 'shelf', id: 'shf_l2' })).toEqual({ kind: 'item', id: 'shf_l2' });
    expect(targetForSelection(basic, { kind: 'compartment', id: 'cmp_left' })).toBeNull();
    expect(nudge(basic, { kind: 'item', id: 'shf_l2' }, 'y', 1)).toEqual([{ op: 'modify_shelf', id: 'shf_l2', y: 810 }]);
    expect(nudge(basic, { kind: 'item', id: 'shf_l2' }, 'y', 1, true)).toEqual([{ op: 'modify_shelf', id: 'shf_l2', y: 900 }]);
    expect(nudge(basic, { kind: 'item', id: 'shf_l2' }, 'x', 1)).toBeNull(); // a shelf has no left and right
    expect(nudge(roomed, { kind: 'wardrobe' }, 'x', -1, true)).toEqual([{ op: 'set_room', offset: 900 }]);
  });
});

describe('people and furniture across the floor (ADR-041)', () => {
  it('the default person joins the household where dropped; a person never stands inside the wardrobe', () => {
    const spec = dragSpec(roomed, { kind: 'figure', index: -1 });
    expect(spec.axes.map((a) => [a.key, a.value])).toEqual([['x', 2450], ['z', 350]]);
    expect(spec.axes[0].limits).toEqual([-800, 2800]); // the room (-1000..3000) less half a body
    const [op] = spec.ops({ x: 2800 });
    expect(op).toEqual({ op: 'set_household', people: [{ name: null, height: 1700, at: [2800, 350] }] });
    const inside = dragSpec(apply(roomed, [{ op: 'set_household', people: [{ height: 1500, at: [500, 900] }] }]), { kind: 'figure', index: 0 });
    expect(inside.ops({ z: 0 })[0].people[0].at).toEqual([500, 250]); // in front of the doors, not in them
  });

  it('a piece of furniture moves across the room and keeps its place on the plan', () => {
    const design = apply(roomed, [{ op: 'set_room', furniture: [{ type: 'bed', x: 2000, y: 2600, width: 1600, depth: 2000, height: 550 }] }]);
    const spec = dragSpec(design, { kind: 'furniture', index: 0 });
    expect(spec.axes.map((a) => [a.key, a.value, a.limits])).toEqual([['x', 1000, [-200, 2200]], ['z', 2000, [400, 2400]]]);
    const moved = apply(design, spec.ops({ z: 2400 }));
    expect(moved.room.furniture[0]).toMatchObject({ x: 2000, y: 3000 });
    expect(spec.label({ z: 2400 })).toBe('מיטה · 140 ס״מ מחזית הארון');
  });
});

