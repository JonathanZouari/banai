import { describe, expect, it } from 'vitest';
import { describeHover } from '../../../src/viewer/format.js';
import { loadDesign } from '../domain/helpers.js';

const basic = loadDesign('basic');

describe('describeHover', () => {
  it.each([
    ['shf_l2', 'Shelf · 80.0 cm from base · 1.8 cm thick'],
    ['drw_r2', 'Drawer · 20.0 cm from base · 20.0 cm high'],
    ['cmp_middle', 'Compartment 2 · width 64.3 cm'],
  ])('labels %s like the selection label', (id, expected) => {
    expect(describeHover(basic, id)).toBe(expected);
  });

  it.each(['prt_1', 'rail_m1', 'dr_left', 'carcass', null])('has no label for %s', (id) => {
    expect(describeHover(basic, id)).toBe('');
  });
});
