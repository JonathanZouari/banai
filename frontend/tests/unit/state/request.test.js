import { describe, expect, it } from 'vitest';
import { cleanNotes, cleanRoom, MAX_NOTES, MAX_ROOM_TEXT } from '../../../src/state/request.js';

const char = (code) => String.fromCodePoint(code);

describe('cleanNotes (customer notes for the carpenter)', () => {
  it('keeps ordinary Hebrew and English text and newlines', () => {
    const text = `ידיות שחורות${char(10)}Black handles, 2 mirrors`;
    expect(cleanNotes(text)).toBe(text);
  });

  it('turns CRLF and lone CR into a single newline', () => {
    expect(cleanNotes(`a${char(13)}${char(10)}b${char(13)}c`)).toBe(`a${char(10)}b${char(10)}c`);
  });

  it('drops control, zero-width and bidi-override characters that can hide or reorder text', () => {
    const hostile = [0x00, 0x07, 0x1b, 0x7f, 0x85, 0x200b, 0x200d, 0x2028, 0x202e, 0x2066, 0xfeff].map(char).join('');
    expect(cleanNotes(`ok${hostile}done`)).toBe('okdone');
  });

  it('keeps markup as plain text (it is only ever shown with textContent)', () => {
    expect(cleanNotes('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });

  it('caps the length and copes with missing input', () => {
    expect(cleanNotes('א'.repeat(MAX_NOTES + 10))).toHaveLength(MAX_NOTES);
    expect(cleanNotes(undefined)).toBe('');
    expect(cleanNotes(null)).toBe('');
  });
});

describe('cleanRoom (the measured wall and the room description)', () => {
  it('keeps valid whole-millimetre lengths within 1 cm to 20 m, else null', () => {
    expect(cleanRoom({ width: 2500, height: 10, depth: 20000 })).toMatchObject({ width: 2500, height: 10, depth: 20000 });
    expect(cleanRoom({ width: 9, height: 20001, depth: 25.5 })).toMatchObject({ width: null, height: null, depth: null });
    expect(cleanRoom({ width: '2500' }).width).toBeNull();
  });

  it('keeps only known obstacles, once each, in a fixed order', () => {
    expect(cleanRoom({ obstacles: ['door', 'evil', 'window', 'door'] }).obstacles).toEqual(['window', 'door']);
    expect(cleanRoom({ obstacles: 'window' }).obstacles).toEqual([]);
  });

  it('cleans and caps the free text', () => {
    const hidden = String.fromCodePoint(0x202e);
    const room = cleanRoom({ style: `קירות לבנים${hidden}`, obstacleNotes: 'א'.repeat(MAX_ROOM_TEXT + 5) });
    expect(room.style).toBe('קירות לבנים');
    expect(room.obstacleNotes).toHaveLength(MAX_ROOM_TEXT);
  });

  it('starts empty from nothing', () => {
    expect(cleanRoom()).toEqual({ width: null, height: null, depth: null, obstacles: [], obstacleNotes: '', style: '' });
  });
});
