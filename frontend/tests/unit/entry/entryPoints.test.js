import { describe, expect, it } from 'vitest';
import { LANGUAGES, translate } from '../../../src/i18n/strings.js';
import { ENTRY_POINTS, getEntryPoint } from '../../../src/entry/entryPoints.js';

describe('entry points', () => {
  it('offers the guided and basic entry points, in order (the third card is Last designs)', () => {
    expect(ENTRY_POINTS.map((e) => e.id)).toEqual(['guided', 'basic']);
  });

  it('focuses the chat (with a localized hint) for the AI entry point only', () => {
    expect(ENTRY_POINTS.filter((e) => e.focusesChat).map((e) => e.id)).toEqual(['guided']);
    for (const language of LANGUAGES) {
      expect(translate(language, 'hintGuided')).toBeTruthy();
      for (const key of ['arcOpenButton', 'arcCardText', 'arcCardAction', 'uiHomeAria']) expect(translate(language, key)).toBeTruthy();
    }
  });

  it('returns null for an unknown id and the data is immutable', () => {
    expect(getEntryPoint('nope')).toBeNull();
    expect(Object.isFrozen(ENTRY_POINTS)).toBe(true);
    expect(Object.isFrozen(ENTRY_POINTS[0])).toBe(true);
  });
});
