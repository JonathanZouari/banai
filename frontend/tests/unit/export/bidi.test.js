import { describe, expect, it } from 'vitest';
import { hasHebrew, toVisual } from '../../../src/export/bidi.js';

describe('toVisual', () => {
  it('leaves text without Hebrew unchanged', () => {
    expect(toVisual('BAI-20261020-94081F')).toBe('BAI-20261020-94081F');
    expect(toVisual('78.74 in × 94.49 in')).toBe('78.74 in × 94.49 in');
    expect(toVisual('')).toBe('');
    expect(toVisual(undefined)).toBe('');
  });

  it('reverses a Hebrew word', () => {
    expect(toVisual('שלום')).toBe('םולש');
  });

  it('puts the first word on the right', () => {
    expect(toVisual('אבג דהו')).toBe('והד גבא');
  });

  it('keeps a measurement together and in reading order', () => {
    // "width 78.74 in × 94.49 in": the measurement is one left-to-right run, placed left of the word.
    expect(toVisual('רוחב 78.74 in × 94.49 in')).toBe('78.74 in × 94.49 in בחור');
  });

  it('mirrors brackets inside Hebrew runs', () => {
    expect(toVisual('(נטו)')).toBe('(וטנ)');
  });

  it('detects Hebrew', () => {
    expect(hasHebrew('abc')).toBe(false);
    expect(hasHebrew('abc א')).toBe(true);
  });
});
