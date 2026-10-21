import { describe, expect, it } from 'vitest';
import { toVisual } from '../../../src/pdf/bidi.js';

const rev = (s) => Array.from(s).reverse().join('');

describe('toVisual', () => {
  it('leaves text without Hebrew untouched', () => {
    expect(toVisual('2400')).toBe('2400');
    expect(toVisual('Side panel 3.1 (nominal)')).toBe('Side panel 3.1 (nominal)');
  });

  it('reverses Hebrew words but keeps numbers readable left to right', () => {
    // logical: מדף 3.1 -> visually the number stays "3.1" and sits left of the word
    expect(toVisual('מדף 3.1')).toBe(`3.1 ${rev('מדף')}`);
    expect(toVisual('גובה 2400')).toBe(`2400 ${rev('גובה')}`);
  });

  it('keeps codes like C1 and D3.1 intact', () => {
    expect(toVisual('תא C1')).toContain('C1');
    expect(toVisual('מגירה D3.1')).toContain('D3.1');
  });

  it('mirrors brackets in right-to-left runs', () => {
    expect(toVisual('(שלום)')).toBe(`(${rev('שלום')})`);
  });

  it('orders a number range the Hebrew way (first number on the right)', () => {
    expect(toVisual('1964 × 2364')).toBe('1964 × 2364'); // no Hebrew: untouched
    expect(toVisual('מידות 1964 × 2364 מ״מ')).toBe(`${rev('מ״מ')} 2364 × 1964 ${rev('מידות')}`);
  });
});
