import { describe, it, expect } from 'vitest';
import { describeSelection } from '../../../src/viewer/format.js';
import { loadDesign } from '../domain/helpers.js';

const design = loadDesign('basic');
const carcassSelection = { id: 'carcass', kind: 'carcass' };
const shelfSelection = { id: 'shf_l1', kind: 'shelf' };

describe('describeSelection', () => {
  it('returns empty string for null selection', () => {
    expect(describeSelection(design, null)).toBe('');
  });

  it('carcass: default cm — shows W × H × D in cm', () => {
    const text = describeSelection(design, carcassSelection);
    expect(text).toMatch(/Wardrobe/);
    expect(text).toMatch(/cm$/);
  });

  it('carcass: mm unit — shows integer mm values', () => {
    const text = describeSelection(design, carcassSelection, 'mm');
    const { width } = design.dimensions;
    expect(text).toContain(String(width));
    expect(text).toMatch(/mm$/);
  });

  it('carcass: in unit — shows inch values with two decimals', () => {
    const text = describeSelection(design, carcassSelection, 'in');
    expect(text).toMatch(/\d+\.\d{2}/);
    expect(text).toMatch(/in$/);
  });

  it('shelf: unit is threaded through y and thickness labels', () => {
    const cm = describeSelection(design, shelfSelection, 'cm');
    const mm = describeSelection(design, shelfSelection, 'mm');
    expect(cm).toContain('cm');
    expect(mm).toContain('mm');
    // mm values are integers; cm values end with one decimal
    expect(mm).toMatch(/\d+ mm from base/);
    expect(cm).toMatch(/\d+\.\d cm from base/);
  });
});
