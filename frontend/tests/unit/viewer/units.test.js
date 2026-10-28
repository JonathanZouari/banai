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

  it('cap is checked on mm not on the typed value (in: limit is ~39370 in, not 1000000)', () => {
    // 1,000,001 mm typed as mm → rejected
    expect(fromDisplay('1000001', 'mm').ok).toBe(false);
    // 39371 inches → round(39371*25.4) = 1,000,023 mm → rejected
    expect(fromDisplay('39371', 'in').ok).toBe(false);
    // 39370 inches → round(39370*25.4) = 999,998 mm → accepted (under cap)
    expect(fromDisplay('39370', 'in').ok).toBe(true);
  });
});

describe('fromDisplay edge cases', () => {
  it('mm: fractional input rounds to nearest integer mm', () => {
    expect(fromDisplay('10.5', 'mm')).toEqual({ ok: true, mm: 11 });
    expect(fromDisplay('10.4', 'mm')).toEqual({ ok: true, mm: 10 });
  });
});

describe('round-trip: toDisplay → fromDisplay', () => {
  it('recovers exact mm for mm and cm units across wardrobe range', () => {
    for (let mm = 10; mm <= 3000; mm += 5) {
      for (const unit of ['mm', 'cm']) {
        const result = fromDisplay(toDisplay(mm, unit), unit);
        expect(result.ok).toBe(true);
        expect(result.mm).toBe(mm);
      }
    }
  });

  it('recovers exact mm for specific inch values', () => {
    // Two decimal places at 1/25.4 ≈ 0.04mm resolution; typical wardrobe dims all round-trip exactly
    for (const mm of [127, 254, 508, 600, 640, 1000, 1200, 2000, 2400]) {
      const result = fromDisplay(toDisplay(mm, 'in'), 'in');
      expect(result.ok).toBe(true);
      expect(result.mm).toBe(mm);
    }
  });
});
