import { describe, expect, it } from 'vitest';
import { describeChanges, formatLength, formatLitres, formatSummary } from '../../../src/editor/summarySection.js';

const summary = (overrides = {}) => ({
  compartments: 3,
  shelves: 7,
  drawers: 2,
  rails: 1,
  interiorVolumeMm3: 1928 * 2364 * 600,
  hangingLengthMm: 643,
  ...overrides,
});

describe('formatLitres', () => {
  it.each([
    [0, '0 L'],
    [400_000, '0 L'], // 0.4 L rounds down
    [500_000, '1 L'], // 0.5 L rounds half up
    [999_499_999, '999 L'],
    [999_500_000, '1,000 L'],
    [1_000_000_000, '1,000 L'],
    [1928 * 2364 * 600, '2,735 L'], // 2,734.68 L
  ])('%i mm³ → %s', (mm3, text) => {
    expect(formatLitres(mm3)).toBe(text);
  });
});

describe('formatLength', () => {
  it.each([
    [0, '0.0 cm'],
    [643, '64.3 cm'],
    [1286, '128.6 cm'],
    [6000, '600.0 cm'],
  ])('%i mm → %s', (mm, text) => {
    expect(formatLength(mm)).toBe(text);
  });
});

describe('formatSummary', () => {
  it('lists every row in display order, with units', () => {
    expect(formatSummary(summary())).toEqual([
      { key: 'compartments', label: 'Compartments', value: '3' },
      { key: 'shelves', label: 'Shelves', value: '7' },
      { key: 'drawers', label: 'Drawers', value: '2' },
      { key: 'rails', label: 'Hanging rails', value: '1' },
      { key: 'interiorVolumeMm3', label: 'Interior volume', value: '2,735 L' },
      { key: 'hangingLengthMm', label: 'Hanging length', value: '64.3 cm' },
    ]);
  });

  it('shows zeros as 0, not blank', () => {
    const values = formatSummary(summary({ shelves: 0, drawers: 0, rails: 0, hangingLengthMm: 0 })).map((row) => row.value);
    expect(values).toEqual(['3', '0', '0', '0', '2,735 L', '0.0 cm']);
  });

  it('never mentions prices or manufacturability', () => {
    const text = JSON.stringify(formatSummary(summary()));
    expect(text).not.toMatch(/price|cost|₪|\$|€|manufactur/i);
  });
});

describe('describeChanges', () => {
  it('is empty when nothing visible changed', () => {
    expect(describeChanges(summary(), summary())).toBe('');
  });

  it('ignores volume changes too small to change the shown litres', () => {
    expect(describeChanges(summary(), summary({ interiorVolumeMm3: 1928 * 2364 * 600 + 1000 }))).toBe('');
  });

  it('names only the changed rows', () => {
    expect(describeChanges(summary(), summary({ shelves: 8 }))).toBe('Design summary: Shelves 8.');
  });

  it('lists several changes in display order', () => {
    const next = summary({ rails: 2, hangingLengthMm: 1286, compartments: 4 });
    expect(describeChanges(summary(), next)).toBe('Design summary: Compartments 4, Hanging rails 2, Hanging length 128.6 cm.');
  });
});
