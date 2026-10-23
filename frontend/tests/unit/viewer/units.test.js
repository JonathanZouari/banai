import { describe, expect, it } from 'vitest';
import { parseLength, toLengthText } from '../../../src/editor/opsFromForm.js';
import { describeSelection, length } from '../../../src/viewer/format.js';
import { DISPLAY_UNITS, mmToUnitText, unitToMm } from '../../../src/viewer/units.js';
import { loadDesign } from '../domain/helpers.js';

const UNITS = Object.keys(DISPLAY_UNITS);

describe('display units', () => {
  it.each(UNITS)('round-trips every whole millimetre through %s text exactly', (unit) => {
    for (let mm = 0; mm <= 5000; mm += 1) {
      const parsed = parseLength(toLengthText(mm, unit), unit);
      expect(parsed, `${mm} mm in ${unit}`).toEqual({ ok: true, mm });
    }
  });

  it('stores inch input as whole millimetres', () => {
    expect(parseLength('80', 'in')).toEqual({ ok: true, mm: 2032 });
    expect(parseLength('25,4', 'in')).toEqual({ ok: true, mm: 645 }); // 645.16 -> 645
    expect(Number.isInteger(unitToMm(33.333, 'in'))).toBe(true);
    expect(parseLength('645', 'mm')).toEqual({ ok: true, mm: 645 });
  });

  it('formats lengths in the chosen unit', () => {
    expect(mmToUnitText(2000, 'in')).toBe('78.74');
    expect(length(643, 'cm')).toBe('64.3 cm');
    expect(length(643, 'mm')).toBe('643 mm');
    expect(length(2032, 'in')).toBe('80.00 in');
    expect(describeSelection(loadDesign('basic'), { kind: 'carcass', id: 'carcass' }, 'mm'))
      .toBe('Wardrobe · 2000 mm × 2400 mm × 600 mm');
  });

  it('names the unit in the error message', () => {
    expect(parseLength('abc', 'in')).toEqual({ ok: false, message: 'Enter a number in inches, e.g. 25.4' });
  });
});
