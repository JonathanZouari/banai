import { describe, expect, it } from 'vitest';
import { LANGUAGES, translate } from '../../../src/i18n/strings.js';
import { ENTRY_POINTS, getEntryPoint } from '../../../src/entry/entryPoints.js';

describe('entry points', () => {
  it('offers exactly the three spec entry points, in order', () => {
    expect(ENTRY_POINTS.map((e) => e.id)).toEqual(['guided', 'freeText', 'basic']);
  });

  it('focuses the chat (with a localized hint) for the two AI entry points only', () => {
    expect(ENTRY_POINTS.filter((e) => e.focusesChat).map((e) => e.id)).toEqual(['guided', 'freeText']);
    for (const language of LANGUAGES) {
      expect(translate(language, 'hintGuided')).toBeTruthy();
      expect(translate(language, 'hintFreeText')).toBeTruthy();
    }
  });

  it('returns null for an unknown id and the data is immutable', () => {
    expect(getEntryPoint('nope')).toBeNull();
    expect(Object.isFrozen(ENTRY_POINTS)).toBe(true);
    expect(Object.isFrozen(ENTRY_POINTS[0])).toBe(true);
  });
});
