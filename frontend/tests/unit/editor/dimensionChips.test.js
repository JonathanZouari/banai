import { describe, expect, it } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { LIMITS } from '../../../src/domain/defaults.js';
import { DomainError } from '../../../src/domain/errors.js';
import { dimensionChips, dimensionOps, friendlyError } from '../../../src/editor/opsFromForm.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const basic = loadDesign('basic');
const chipsFor = (design, field) => dimensionChips(design, catalog, field);

describe('dimensionChips', () => {
  it('marks the preset equal to the current value as active and offers only sizes inside the limits', () => {
    expect(chipsFor(basic, 'width').filter((chip) => chip.active).map((chip) => chip.mm)).toEqual([2000]);
    for (const field of ['width', 'height', 'depth']) {
      const [min, max] = LIMITS[field];
      chipsFor(basic, field).forEach((chip) => expect(chip.mm >= min && chip.mm <= max).toBe(true));
    }
  });

  it('marks nothing active when the current value is not a preset', () => {
    const custom = applyOps(basic, dimensionOps('width', 2137), catalog);
    expect(chipsFor(custom, 'width').some((chip) => chip.active)).toBe(false);
  });

  it('disables a height that would leave the top shelf outside the interior', () => {
    const chip = chipsFor(basic, 'height').find((c) => c.mm === 2000);
    expect(chip.ok).toBe(false);
    expect(chip.error).toBeInstanceOf(DomainError);
    expect(chip.error.code).toBe('OUT_OF_BOUNDS');
    expect(friendlyError(chip.error)).toBeTruthy();
    expect(chipsFor(basic, 'height').find((c) => c.mm === 2200).ok).toBe(true);
  });

  it('disables a width that would squeeze a compartment under its minimum', () => {
    const crowded = applyOps(null, [{ op: 'create_wardrobe', width: 3000, height: 2400, depth: 600, compartmentCount: 20 }], catalog);
    const narrow = chipsFor(crowded, 'width').find((c) => c.mm === 1000);
    expect(narrow.ok).toBe(false);
    expect(narrow.error).toBeInstanceOf(DomainError);
    expect(chipsFor(crowded, 'width').find((c) => c.mm === 3000)).toMatchObject({ active: true, ok: true });
  });

  it('agrees with dispatch: enabled chips apply, disabled chips are rejected', () => {
    for (const field of ['width', 'height', 'depth']) {
      chipsFor(basic, field).forEach((chip) => {
        const apply = () => applyOps(basic, dimensionOps(field, chip.mm), catalog);
        if (chip.ok) expect(apply().dimensions[field]).toBe(chip.mm);
        else expect(apply).toThrow(DomainError);
      });
    }
  });

  it('never mutates the design it is given', () => {
    const before = JSON.stringify(basic);
    ['width', 'height', 'depth'].forEach((field) => chipsFor(basic, field));
    expect(JSON.stringify(basic)).toBe(before);
  });
});
