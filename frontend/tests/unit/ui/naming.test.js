import { describe, expect, it } from 'vitest';
import { describeOps, labelOf, nameOf, sectionName } from '../../../src/ui/naming.js';
import { loadDesign } from '../domain/helpers.js';

const design = loadDesign('basic');

describe('customer-facing names', () => {
  it('names sections by position and never exposes ids', () => {
    expect([0, 1, 2].map((i) => sectionName(design, i))).toEqual(['Left section', 'Middle section', 'Right section']);
    expect(labelOf(design, 'cmp_middle')).toBe('Middle section');
    expect(labelOf(design, 'carcass')).toBe('Wardrobe body');
  });

  it('numbers items bottom to top within their section', () => {
    expect(nameOf(design, 'shf_l1')).toEqual({ title: 'Shelf 1', parent: 'Left section', kind: 'shelf' });
    expect(labelOf(design, 'shf_l2')).toBe('Shelf 2 · Left section');
    expect(labelOf(design, 'rail_m1')).toBe('Hanging rail · Middle section');
  });

  it('uses "Divider" for partitions and numbered names for wide layouts', () => {
    expect(labelOf(design, design.partitions[0].id)).toBe('Divider 1');
    const wide = { ...design, compartments: [...design.compartments, { ...design.compartments[0], id: 'cmp_x' }] };
    expect(sectionName(wide, 3)).toBe('Section 4');
  });

  it('returns empty / null for unknown ids', () => {
    expect(nameOf(design, 'shf_missing')).toBeNull();
    expect(labelOf(design, 'shf_missing')).toBe('');
  });
});

describe('describeOps', () => {
  it('describes changes in customer terms and groups additions', () => {
    const lines = describeOps(design, [
      { op: 'modify_compartment', compartmentId: 'cmp_middle', width: 820 },
      { op: 'add_drawer', compartmentId: 'cmp_right', y: 0, height: 200 },
      { op: 'add_drawer', compartmentId: 'cmp_right', y: 200, height: 200 },
      { op: 'add_shelf', compartmentId: 'cmp_left', y: 1900 },
      { op: 'remove_component', id: 'shf_l2' },
    ]);
    expect(lines).toEqual([
      'Middle section: 64.3 → 82.0 cm',
      'Add 2 drawers to Right section',
      'Add a shelf to Left section',
      'Remove Shelf 2 · Left section',
    ]);
  });

  it('describes dimension changes', () => {
    expect(describeOps(design, [{ op: 'update_dimensions', width: 2400 }])).toEqual(['Width 200.0 → 240.0 cm']);
  });
});
