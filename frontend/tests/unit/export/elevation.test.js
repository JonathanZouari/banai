import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { frontElevation, hatch, pickScale, planView, SCALES } from '../../../src/export/elevation.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const roles = (drawing) => drawing.shapes.reduce((counts, s) => ({ ...counts, [s.role]: (counts[s.role] ?? 0) + 1 }), {});
const chain = (drawing, level) => drawing.dims.filter((d) => d.axis === 'x' && d.level === level);

describe('pickScale', () => {
  it('chooses the largest standard scale that fits', () => {
    expect(pickScale(2000, 2400, 165, 121)).toBe(20);
    expect(pickScale(2000, 2400, 50, 50)).toBe(50);
    expect(pickScale(6000, 3500, 165, 121)).toBe(50);
  });

  it('falls back to the smallest drawing scale', () => {
    expect(pickScale(1e7, 1e7, 10, 10)).toBe(SCALES.at(-1));
  });
});

describe('frontElevation, interior', () => {
  const drawing = frontElevation(basic, 'interior');

  it('draws every partition, shelf, drawer and rail', () => {
    expect(roles(drawing)).toMatchObject({ outline: 1, inner: 1, partition: 2, shelf: 7, drawer: 2, rail: 1 });
    expect(roles(drawing).door).toBeUndefined();
  });

  it('tags interior items with their height from the base', () => {
    expect(drawing.tags.map((t) => t.mm).sort((a, b) => a - b)).toEqual([200, 400, 400, 800, 800, 1200, 1400, 1600, 1900, 2000]);
  });

  it('adds up the bottom dimension chain to the overall width', () => {
    const segments = chain(drawing, 1);
    expect(segments.reduce((sum, d) => sum + d.mm, 0)).toBe(basic.dimensions.width);
    expect(segments[0].mm).toBe(basic.carcass.panelThickness);
    expect(chain(drawing, 2)).toEqual([{ axis: 'x', from: 0, to: 2000, level: 2, mm: 2000 }]);
  });

  it('includes the overall and clear height', () => {
    const heights = drawing.dims.filter((d) => d.axis === 'y').map((d) => d.mm).sort((a, b) => a - b);
    expect(heights).toEqual([2364, 2400]);
  });
});

describe('frontElevation, doors closed', () => {
  it('draws doors, handles and hinge marks for hinged doors', () => {
    const drawing = frontElevation(basic, 'closed');
    expect(roles(drawing)).toMatchObject({ door: 3, handle: 3, hinge: 6 });
    expect(roles(drawing).shelf).toBeUndefined();
    expect(drawing.shapes.filter((s) => s.role === 'hinge').every((s) => s.dashed)).toBe(true);
  });

  it('puts the hinge point on the hinge side and the handle on the free edge', () => {
    const drawing = frontElevation(basic, 'closed');
    const [door] = drawing.shapes.filter((s) => s.role === 'door');
    const hinge = drawing.shapes.filter((s) => s.role === 'hinge').slice(0, 2);
    expect(hinge.every((l) => l.x2 === door.x)).toBe(true); // door 1: hinge on the left
    const [handle] = drawing.shapes.filter((s) => s.role === 'handle');
    expect(handle.x).toBeGreaterThan(door.x + door.w / 2); // free edge is on the right
  });

  it('hatches mirror fronts', () => {
    const mirrored = applyOps(basic, [{ op: 'modify_door', id: 'dr_left', front: 'mirror' }], catalog);
    expect(roles(frontElevation(mirrored, 'closed')).mirror).toBeGreaterThan(3);
    expect(roles(frontElevation(basic, 'closed')).mirror).toBeUndefined();
  });

  it('draws sliding panels with overlap and no hinge marks', () => {
    const sliding = applyOps(basic, [{ op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] }], catalog);
    const drawing = frontElevation(sliding, 'closed');
    const doors = drawing.shapes.filter((s) => s.role === 'door');
    expect(doors).toHaveLength(2);
    expect(roles(drawing).hinge).toBeUndefined();
    const [a, b] = [...doors].sort((x, y) => x.x - y.x);
    expect(a.x + a.w).toBeGreaterThan(b.x); // they overlap
    expect(Math.min(...doors.map((d) => d.x))).toBeGreaterThanOrEqual(basic.carcass.panelThickness);
  });

  it('omits handles when the style is none, and doors when there are none', () => {
    const noHandles = applyOps(basic, [{ op: 'set_handles', style: 'none' }], catalog);
    expect(roles(frontElevation(noHandles, 'closed')).handle).toBeUndefined();
    const noDoors = applyOps(basic, [{ op: 'configure_doors', type: 'none' }], catalog);
    expect(roles(frontElevation(noDoors, 'closed')).door).toBeUndefined();
  });
});

describe('planView', () => {
  it('shows the footprint, partitions and doors in front', () => {
    const plan = planView(basic);
    expect(roles(plan)).toMatchObject({ outline: 1, inner: 1, partition: 2, door: 3 });
    expect(plan.minY).toBe(-18);
    expect(plan.dims.map((d) => d.mm)).toEqual([2000, 600]);
  });
});

describe('hatch', () => {
  it('keeps every line inside its rectangle', () => {
    const lines = hatch(100, 200, 300, 500, 60);
    expect(lines.length).toBeGreaterThan(5);
    lines.forEach((l) => {
      [[l.x1, l.y1], [l.x2, l.y2]].forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(100 - 1e-9);
        expect(x).toBeLessThanOrEqual(400 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(200 - 1e-9);
        expect(y).toBeLessThanOrEqual(700 + 1e-9);
      });
    });
  });
});
