import { describe, expect, it } from 'vitest';
import { ENTRY_POINTS, getEntryPoint } from '../../../src/entry/entryPoints.js';

describe('entry points', () => {
  it('offers exactly the three spec entry points, in order', () => {
    expect(ENTRY_POINTS.map((e) => e.id)).toEqual(['guided', 'freeText', 'basic']);
  });

  it('gives the two AI entry points a composer hint and the basic one none', () => {
    expect(getEntryPoint('guided').composerHint).not.toBe('');
    expect(getEntryPoint('freeText').composerHint).not.toBe('');
    expect(getEntryPoint('basic').composerHint).toBe('');
  });

  it('returns null for an unknown id and the data is immutable', () => {
    expect(getEntryPoint('nope')).toBeNull();
    expect(Object.isFrozen(ENTRY_POINTS)).toBe(true);
    expect(Object.isFrozen(ENTRY_POINTS[0])).toBe(true);
  });
});
