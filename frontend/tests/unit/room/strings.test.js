import { describe, expect, it } from 'vitest';
import { LANGUAGES, STRINGS } from '../../../src/chat/i18n.js';
import { roomStrings } from '../../../src/room/roomControls.js';

const shape = (value) => (value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]))
  : typeof value);

describe('room strings', () => {
  it('every chat language has the same room words as English (nested groups included)', () => {
    LANGUAGES.forEach((language) => expect(shape(STRINGS[language].room), language).toEqual(shape(STRINGS.en.room)));
  });

  it('Spanish is really Spanish, not English copied', () => {
    expect(STRINGS.es.room.button).toBe('Ver en una habitación');
    expect(STRINGS.es.room.notFit('cama doble')).toBe('No cabe en este tamaño de habitación: cama doble.');
  });

  it('a language without room words falls back to English, word by word', () => {
    expect(roomStrings({})).toEqual(roomStrings(STRINGS.en));
    const partial = roomStrings({ room: { button: 'Zimmer', positions: { left: 'Links' } } });
    expect(partial.button).toBe('Zimmer');
    expect(partial.positions).toEqual({ ...STRINGS.en.room.positions, left: 'Links' });
    expect(partial.panel).toBe(STRINGS.en.room.panel);
  });
});
