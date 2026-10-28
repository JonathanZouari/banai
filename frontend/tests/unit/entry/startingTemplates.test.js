import { describe, expect, it } from 'vitest';
import { STARTING_TEMPLATES } from '../../../src/entry/startScreen.js';
import { ENTRY_POINTS } from '../../../src/entry/entryPoints.js';

describe('starting templates on the start screen', () => {
  it('lists the three new templates, not basic (it keeps its own card)', () => {
    expect(STARTING_TEMPLATES.map((t) => t.id)).toEqual(['kids', 'double-sliding', 'minimalist']);
    expect(Object.isFrozen(STARTING_TEMPLATES)).toBe(true);
  });

  it('leaves the three entry points untouched', () => {
    expect(ENTRY_POINTS.map((e) => e.id)).toEqual(['guided', 'freeText', 'basic']);
  });

  it('each template has a readable name and description', () => {
    for (const template of STARTING_TEMPLATES) {
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.name).not.toMatch(/[<>]/);
    }
  });
});
