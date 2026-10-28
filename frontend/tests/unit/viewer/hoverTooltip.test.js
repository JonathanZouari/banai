import { describe, expect, it, vi } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { createStore } from '../../../src/state/store.js';
import { hoverLabel, placeTooltip } from '../../../src/viewer/hoverTooltip.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic'); // compartments cmp_left 643 / cmp_middle 643 / cmp_right 642 mm; shf_l2 at 800 mm; drw_r1 200 mm high

describe('hoverLabel', () => {
  it('shelf: height from the base, Hebrew and English', () => {
    expect(hoverLabel(basic, 'shf_l2', 'he')).toBe('מדף · גובה 80 ס"מ');
    expect(hoverLabel(basic, 'shf_l2', 'en')).toBe('Shelf · height 80 cm');
    expect(hoverLabel(basic, 'shf_l1', 'he')).toBe('מדף · גובה 40 ס"מ');
  });

  it('drawer: its own height', () => {
    expect(hoverLabel(basic, 'drw_r1', 'he')).toBe('מגירה · גובה 20 ס"מ');
    expect(hoverLabel(basic, 'drw_r1', 'en')).toBe('Drawer · height 20 cm');
  });

  it('compartment: its number and width, keeping real decimals', () => {
    expect(hoverLabel(basic, 'cmp_left', 'he')).toBe('תא 1 · רוחב 64.3 ס"מ');
    expect(hoverLabel(basic, 'cmp_right', 'en')).toBe('Compartment 3 · width 64.2 cm');
  });

  it('drops only a pointless trailing .0', () => {
    const moved = applyOps(basic, [{ op: 'modify_shelf', id: 'shf_l2', y: 805 }], catalog);
    expect(hoverLabel(moved, 'shf_l2', 'en')).toBe('Shelf · height 80.5 cm');
  });

  it('other components, unknown ids and bad input have no tooltip', () => {
    const door = basic.doors.items[0].id;
    for (const id of [door, basic.partitions[0].id, 'carcass', 'shf_nope', '', null, undefined, 42, {}]) {
      expect(hoverLabel(basic, id, 'he'), String(id)).toBeNull();
    }
    expect(hoverLabel(null, 'shf_l2', 'he')).toBeNull();
    const withRail = applyOps(basic, [{ op: 'add_rail', compartmentId: 'cmp_middle', y: 1700 }], catalog);
    expect(hoverLabel(withRail, withRail.compartments[1].rails[0].id, 'he')).toBeNull();
  });

  it('falls back to English for an unknown language', () => {
    expect(hoverLabel(basic, 'shf_l2', 'fr')).toBe('Shelf · height 80 cm');
    expect(hoverLabel(basic, 'shf_l2')).toBe('Shelf · height 80 cm');
  });

  it('never returns markup: text only, with the numbers as plain text', () => {
    for (const id of ['shf_l2', 'drw_r1', 'cmp_left']) {
      for (const language of ['he', 'en']) expect(hoverLabel(basic, id, language)).not.toMatch(/[<>&]/);
    }
  });
});

describe('placeTooltip', () => {
  const container = { width: 800, height: 600 };
  it('sits below and to the right of the pointer by default', () => {
    expect(placeTooltip({ x: 100, y: 100, width: 120, height: 24, container })).toEqual({ left: 112, top: 112 });
  });

  it('flips to the left of the pointer near the right edge, and above near the bottom', () => {
    expect(placeTooltip({ x: 780, y: 100, width: 120, height: 24, container }).left).toBe(780 - 12 - 120);
    expect(placeTooltip({ x: 100, y: 590, width: 120, height: 24, container }).top).toBe(590 - 12 - 24);
  });

  it('stays inside the container, even a tiny one', () => {
    for (const [x, y] of [[0, 0], [799, 599], [400, 300], [5, 595]]) {
      const { left, top } = placeTooltip({ x, y, width: 120, height: 24, container });
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + 120).toBeLessThanOrEqual(800);
      expect(top + 24).toBeLessThanOrEqual(600);
    }
    const tiny = placeTooltip({ x: 10, y: 10, width: 120, height: 24, container: { width: 50, height: 10 } });
    expect(tiny).toEqual({ left: 0, top: 0 });
  });
});

describe('hover does not touch the design state', () => {
  it('computing labels leaves the store identical and notifies nobody', () => {
    const store = createStore({ design: basic, revision: 5, catalog });
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getState();
    for (const id of ['shf_l2', 'drw_r1', 'cmp_left', 'nope']) hoverLabel(store.getState().design, id, 'he');
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
