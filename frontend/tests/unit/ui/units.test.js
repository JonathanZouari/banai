import { describe, expect, it, vi } from 'vitest';
import { compactLength, createUnits, DEFAULT_UNIT, formatLength, lengthLabel, parseLength, UNITS } from '../../../src/ui/units.js';

const memory = (initial) => {
  const data = new Map(initial ? [['banai.units', initial]] : []);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

describe('units', () => {
  it('offers cm and in only, with cm as the default', () => {
    expect(UNITS).toEqual(['cm', 'in']);
    expect(DEFAULT_UNIT).toBe('cm');
  });

  it('formats the same length in each unit', () => {
    expect(formatLength(2000, 'cm')).toBe('200.0');
    expect(formatLength(2000, 'mm')).toBe('200.0'); // mm is no longer offered and falls back to cm
    expect(formatLength(2000, 'in')).toBe('78.74');
    expect(lengthLabel(643, 'cm')).toBe('64.3 cm');
    expect(lengthLabel(25.4, 'in')).toBe('1.00 in');
    expect(formatLength(2000, 'nonsense')).toBe('200.0'); // unknown unit falls back to the default
    expect(compactLength(2400, 'cm')).toBe('240');
    expect(compactLength(643, 'cm')).toBe('64.3');
    expect(compactLength(2000, 'in')).toBe('78.74');
  });

  it('parses typed text back to integer millimetres', () => {
    expect(parseLength('200', 'cm')).toEqual({ ok: true, mm: 2000 });
    expect(parseLength('64,35', 'cm')).toEqual({ ok: true, mm: 644 });
    expect(parseLength('200', 'mm')).toEqual({ ok: true, mm: 2000 }); // falls back to cm
    expect(parseLength('78.74', 'in')).toEqual({ ok: true, mm: 2000 });
    expect(parseLength(' 1 ', 'in')).toEqual({ ok: true, mm: 25 });
  });

  it('rejects bad input with a message that names the unit', () => {
    expect(parseLength('abc', 'in')).toMatchObject({ ok: false, code: 'NOT_A_NUMBER', unit: 'in', example: '25.5', message: 'Enter a number in in, e.g. 25.5' });
    expect(parseLength('', 'cm').ok).toBe(false);
    expect(parseLength('1e5', 'cm').ok).toBe(false);
    expect(parseLength('999999999', 'cm')).toMatchObject({ ok: false, code: 'TOO_LARGE', message: 'That value is too large' });
  });

  it('round-trips every unit without drifting by more than half a unit step', () => {
    for (const unit of UNITS) {
      for (const mm of [1, 18, 643, 2000, 3500]) {
        const back = parseLength(formatLength(mm, unit), unit).mm;
        const step = unit === 'cm' ? 5 : 0.13;
        expect(Math.abs(back - mm)).toBeLessThanOrEqual(step * (unit === 'in' ? 25.4 : 1) + 0.5);
      }
    }
  });
});

describe('units store', () => {
  it('remembers the choice, validates it and notifies subscribers once per change', () => {
    const storage = memory();
    const units = createUnits(storage);
    const listener = vi.fn();
    units.subscribe(listener);
    expect(units.get()).toBe('cm');
    expect(units.set('in')).toBe(true);
    expect(units.set('in')).toBe(true); // no change, no notification
    expect(units.set('furlong')).toBe(false);
    expect(units.get()).toBe('in');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createUnits(storage).get()).toBe('in');
  });

  it('works without storage and ignores a broken stored value', () => {
    expect(createUnits(undefined).get()).toBe('cm');
    expect(createUnits(memory('banana')).get()).toBe('cm');
    expect(createUnits(memory('mm')).get()).toBe('cm'); // a remembered mm choice falls back to cm
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const units = createUnits(broken);
    expect(() => units.set('in')).not.toThrow();
    expect(units.get()).toBe('in');
  });
});
