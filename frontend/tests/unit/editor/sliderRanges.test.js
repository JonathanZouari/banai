import { describe, expect, it } from 'vitest';
import {
  compartmentWidthRange, dimensionRange, itemYRange, normalizeRange, pageStep, snapToRange,
} from '../../../src/editor/sliderRanges.js';
import { loadDesign } from '../domain/helpers.js';

const basic = loadDesign('basic');
const floor10 = (value) => Math.floor(value / 10) * 10;

describe('normalizeRange', () => {
  it('lowers max onto the step grid and rejects unusable input', () => {
    expect(normalizeRange({ min: 0, max: 1946 })).toEqual({ min: 0, max: 1940, step: 10 });
    expect(normalizeRange({ min: 50, max: 1000, step: 10 })).toEqual({ min: 50, max: 1000, step: 10 });
    expect(normalizeRange({ min: 10, max: 5 })).toBeNull();
    expect(normalizeRange({ min: 0, max: Number.NaN })).toBeNull();
  });
});

describe('slider ranges', () => {
  it('uses the domain limits for width, height and depth', () => {
    expect(dimensionRange('width')).toEqual({ min: 300, max: 6000, step: 10 });
    expect(dimensionRange('height')).toEqual({ min: 300, max: 3500, step: 10 });
    expect(dimensionRange('depth')).toEqual({ min: 200, max: 1200, step: 10 });
    expect(dimensionRange('nope')).toBeNull();
  });

  it('keeps shelves, drawers and rails inside the interior', () => {
    const interior = basic.dimensions.height - 2 * basic.carcass.panelThickness;
    const shelf = basic.compartments[0].shelves[0];
    expect(itemYRange(basic, 'shelf', shelf).max).toBe(floor10(interior - shelf.thickness));
    expect(itemYRange(basic, 'drawer', { height: 200 }).max).toBe(floor10(interior - 200));
    expect(itemYRange(basic, 'rail', { y: 0 })).toEqual({ min: 0, max: floor10(interior), step: 10 });
  });

  it('limits a compartment by the minimum width of its neighbour; none for a single compartment', () => {
    const [first, second] = basic.compartments;
    expect(compartmentWidthRange(basic, first.id)).toEqual({ min: 50, max: floor10(first.width + second.width - 50), step: 10 });
    const last = basic.compartments.at(-1);
    const before = basic.compartments.at(-2);
    expect(compartmentWidthRange(basic, last.id).max).toBe(floor10(last.width + before.width - 50));
    expect(compartmentWidthRange({ compartments: [first] }, first.id)).toBeNull();
    expect(compartmentWidthRange(basic, 'cmp_missing')).toBeNull();
  });
});

describe('snap and page steps', () => {
  const range = { min: 300, max: 6000, step: 10 };

  it('snaps onto the grid and clamps', () => {
    expect(snapToRange(2004, range)).toBe(2000);
    expect(snapToRange(2006, range)).toBe(2010);
    expect(snapToRange(10, range)).toBe(300);
    expect(snapToRange(9000, range)).toBe(6000);
  });

  it('PageUp / PageDown move 10 cm and stop at the ends', () => {
    expect(pageStep(2000, 1, range)).toBe(2100);
    expect(pageStep(2000, -1, range)).toBe(1900);
    expect(pageStep(6000, 1, range)).toBe(6000);
    expect(pageStep(320, -1, range)).toBe(300);
  });
});
