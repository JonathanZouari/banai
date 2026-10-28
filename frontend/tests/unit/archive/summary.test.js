import { describe, expect, it } from 'vitest';
import { formatDate, formatSize, summarize } from '../../../src/archive/summary.js';
import { loadDesign } from '../domain/helpers.js';

describe('archive summary', () => {
  it('counts compartments, interior items and doors', () => {
    const design = loadDesign('basic');
    const s = summarize(design);
    expect(s.compartments).toBe(design.compartments.length);
    expect(s.shelves).toBe(design.compartments.reduce((n, c) => n + c.shelves.length, 0));
    expect(s.doors).toBe(design.doors.items.length);
    expect(s.width).toBe(design.dimensions.width);
  });

  it('tolerates missing or odd parts', () => {
    expect(summarize({})).toMatchObject({ compartments: 0, shelves: 0, doors: 0, doorType: 'none' });
    expect(summarize(null).compartments).toBe(0);
    expect(summarize({ doors: { type: 'weird', items: 'x' }, compartments: [{ shelves: 'x' }] })).toMatchObject({ doorType: 'none', doors: 0, shelves: 0 });
  });

  it('formats the size in the chosen unit and falls back to cm', () => {
    const dims = { width: 2000, height: 2400, depth: 600 };
    expect(formatSize(dims, 'cm')).toBe('200.0 × 240.0 × 60.0 cm');
    expect(formatSize(dims, 'in')).toBe('78.74 × 94.49 × 23.62 in');
    expect(formatSize(dims, 'furlong')).toBe('200.0 × 240.0 × 60.0 cm');
  });

  it('formats dates and survives invalid input or an unknown locale', () => {
    expect(formatDate(Date.UTC(2026, 9, 28, 12), 'en')).toMatch(/2026/);
    expect(formatDate(NaN, 'en')).toBe('');
    expect(formatDate(Date.UTC(2026, 9, 28), 'not a locale!!')).toMatch(/2026/);
  });
});
