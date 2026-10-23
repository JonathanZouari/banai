import { describe, it, expect } from 'vitest';
import { toDisplay, fromDisplay, UNITS } from '../../../src/viewer/units.js';

describe('UNITS', () => {
  it('lists mm, cm, in', () => {
    expect(UNITS).toEqual(['mm', 'cm', 'in']);
  });
});

describe('toDisplay', () => {
  it('mm: returns integer as string', () => {
    expect(toDisplay(640, 'mm')).toBe('640');
    expect(toDisplay(18, 'mm')).toBe('18');
  });

  it('cm: one decimal place', () => {
    expect(toDisplay(640, 'cm')).toBe('64.0');
    expect(toDisplay(645, 'cm')).toBe('64.5');
    expect(toDisplay(18, 'cm')).toBe('1.8');
  });

  it('in: two decimal places', () => {
    expect(toDisplay(254, 'in')).toBe('10.00');
    expect(toDisplay(25, 'in')).toBe('0.98'); // round(25/25.4)
  });
});

describe('fromDisplay', () => {
  it('mm: integer input', () => {
    expect(fromDisplay('640', 'mm')).toEqual({ ok: true, mm: 640 });
    expect(fromDisplay('18', 'mm')).toEqual({ ok: true, mm: 18 });
  });

  it('mm: rejects non-numeric', () => {
    expect(fromDisplay('abc', 'mm').ok).toBe(false);
    expect(fromDisplay('', 'mm').ok).toBe(false);
  });

  it('cm: converts to mm with rounding', () => {
    expect(fromDisplay('64.0', 'cm')).toEqual({ ok: true, mm: 640 });
    expect(fromDisplay('64.5', 'cm')).toEqual({ ok: true, mm: 645 });
    expect(fromDisplay('1.8', 'cm')).toEqual({ ok: true, mm: 18 });
  });

  it('cm: accepts comma as decimal separator', () => {
    expect(fromDisplay('64,5', 'cm')).toEqual({ ok: true, mm: 645 });
  });

  it('in: converts to mm with rounding', () => {
    expect(fromDisplay('10', 'in')).toEqual({ ok: true, mm: 254 });  // 10 * 25.4
    expect(fromDisplay('1', 'in')).toEqual({ ok: true, mm: 25 });    // round(25.4)
    expect(fromDisplay('1.5', 'in')).toEqual({ ok: true, mm: 38 });  // round(38.1)
  });

  it('rejects non-numeric strings', () => {
    expect(fromDisplay('abc', 'cm').ok).toBe(false);
    expect(fromDisplay('', 'cm').ok).toBe(false);
    expect(fromDisplay('1 2', 'cm').ok).toBe(false);
  });
});

describe('fromDisplay edge cases', () => {
  it('mm: fractional input rounds to nearest integer mm', () => {
    expect(fromDisplay('10.5', 'mm')).toEqual({ ok: true, mm: 11 });
    expect(fromDisplay('10.4', 'mm')).toEqual({ ok: true, mm: 10 });
  });
});

describe('round-trip: toDisplay → fromDisplay', () => {
  const cases = [
    { mm: 640, unit: 'mm' },
    { mm: 640, unit: 'cm' },
    { mm: 645, unit: 'cm' },
    { mm: 254, unit: 'in' },  // exact inch
    { mm: 600, unit: 'in' },  // round-trips within 1 mm due to inch conversion
  ];

  it('recovers original mm within 1 mm for all units', () => {
    for (const { mm, unit } of cases) {
      const text = toDisplay(mm, unit);
      const result = fromDisplay(text, unit);
      expect(result.ok).toBe(true);
      expect(Math.abs(result.mm - mm)).toBeLessThanOrEqual(1);
    }
  });
});
