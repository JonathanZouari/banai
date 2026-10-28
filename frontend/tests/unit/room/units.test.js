import { describe, expect, it } from 'vitest';
import { parseRoomSize } from '../../../src/room/roomControls.js';
import { ROOM_SIZE_LIMITS } from '../../../src/room/roomState.js';

describe('room sizes in the display unit (kept in mm)', () => {
  it('reads centimetres, millimetres and inches (with fractions) into integer millimetres', () => {
    expect(parseRoomSize('400', 'cm', 'width')).toBe(4000);
    expect(parseRoomSize('412,5', 'cm', 'width')).toBe(4125);
    expect(parseRoomSize('4400', 'mm', 'length')).toBe(4400);
    expect(parseRoomSize('157 1/2', 'in', 'width')).toBe(4001);
    expect(parseRoomSize('102.36', 'in', 'height')).toBe(2600);
  });

  it('keeps sizes within the room limits', () => {
    expect(parseRoomSize('1', 'cm', 'width')).toBe(ROOM_SIZE_LIMITS.width[0]);
    expect(parseRoomSize('99999', 'cm', 'height')).toBe(ROOM_SIZE_LIMITS.height[1]);
  });

  it('anything that is not a number is refused (null), never guessed', () => {
    expect(parseRoomSize('four metres', 'cm', 'width')).toBeNull();
    expect(parseRoomSize('', 'mm', 'width')).toBeNull();
    expect(parseRoomSize('1/2', 'cm', 'width')).toBeNull(); // fractions are for inches only
  });
});
