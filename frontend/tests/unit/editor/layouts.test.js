import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { validateDesign } from '../../../src/domain/validation.js';
import { INTERIOR_LAYOUTS, layoutOps } from '../../../src/editor/layouts.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const counts = (compartment) => ({
  shelves: compartment.shelves.length, drawers: compartment.drawers.length, rails: compartment.rails.length,
});
const apply = (design, id) => applyOps(design, layoutOps(design, id), catalog);

describe('interior layouts', () => {
  it('offers Classic plus two more formations', () => {
    expect(INTERIOR_LAYOUTS.map((l) => l.id)).toEqual(['classic', 'hanging', 'storage']);
  });

  it('Classic reproduces the basic wardrobe interior at the default size', () => {
    const result = apply(basic, 'classic');
    result.compartments.forEach((compartment, i) => {
      const original = basic.compartments[i];
      expect(compartment.shelves.map((s) => s.y)).toEqual(original.shelves.map((s) => s.y));
      expect(compartment.drawers.map((d) => [d.y, d.height])).toEqual(original.drawers.map((d) => [d.y, d.height]));
      expect(compartment.rails.map((r) => r.y)).toEqual(original.rails.map((r) => r.y));
    });
  });

  it('Hanging focus gives long hanging, open shelves and double hanging', () => {
    const [left, middle, right] = apply(basic, 'hanging').compartments;
    expect(counts(left)).toEqual({ shelves: 1, drawers: 0, rails: 1 });
    expect(counts(middle)).toEqual({ shelves: 5, drawers: 0, rails: 0 });
    expect(counts(right)).toEqual({ shelves: 2, drawers: 0, rails: 2 });
  });

  it('Shelves & drawers gives drawer towers around a tall shelf stack', () => {
    const [left, middle, right] = apply(basic, 'storage').compartments;
    expect(counts(left)).toEqual({ shelves: 3, drawers: 4, rails: 0 });
    expect(counts(middle)).toEqual({ shelves: 6, drawers: 0, rails: 0 });
    expect(counts(right)).toEqual(counts(left));
  });

  it('keeps dimensions, doors and materials, and only changes the interior', () => {
    const result = apply(basic, 'storage');
    expect(result.dimensions).toEqual(basic.dimensions);
    expect(result.doors).toEqual(basic.doors);
    expect(result.carcass).toEqual(basic.carcass);
    expect(result.compartments.map((c) => [c.id, c.width])).toEqual(basic.compartments.map((c) => [c.id, c.width]));
  });

  it.each([
    ['a low wardrobe', [{ op: 'update_dimensions', height: 600 }]],
    ['a tall wide wardrobe with five compartments', [
      { op: 'update_dimensions', width: 3200, height: 3000 },
      { op: 'add_compartment', position: 0, width: 400 },
      { op: 'add_compartment', position: 2, width: 400 },
    ]],
  ])('produces a valid design for %s', (_, setup) => {
    // Empty the interior first, so resizing never conflicts with the existing items.
    const empty = applyOps(basic, layoutOps(basic, 'classic').filter((op) => op.op === 'remove_component'), catalog);
    const shaped = applyOps(empty, setup, catalog);
    for (const { id } of INTERIOR_LAYOUTS) {
      const result = apply(shaped, id);
      expect(validateDesign(result, catalog)).toEqual([]);
    }
  });

  it('returns no ops for an unknown layout', () => {
    expect(layoutOps(basic, 'nope')).toEqual([]);
  });
});
