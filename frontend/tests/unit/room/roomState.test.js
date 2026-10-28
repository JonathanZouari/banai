import { describe, expect, it, vi } from 'vitest';
import { createRoomState, ROOM_DEFAULTS, sanitizeRoom } from '../../../src/room/roomState.js';

const memory = (initial = null) => {
  const data = new Map(initial ? [['banai.room.v1', initial]] : []);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
};

describe('room state', () => {
  it('is off by default, so the existing viewer is unchanged until someone opens the room', () => {
    expect(createRoomState({ storage: memory() }).get()).toMatchObject({ enabled: false, wardrobeAt: 'centre', hintSeen: false });
  });

  it('is remembered per browser', () => {
    const storage = memory();
    createRoomState({ storage }).set({ enabled: true, size: { width: 3600 } });
    expect(createRoomState({ storage }).get()).toMatchObject({ enabled: true, size: { width: 3600, length: ROOM_DEFAULTS.size.length } });
  });

  it('ignores anything malformed or out of range (falls back to defaults)', () => {
    const state = createRoomState({ storage: memory('{"enabled":"yes","size":{"width":-5,"height":2700},"wardrobeAt":"roof","extra":1}') }).get();
    expect(state).toEqual({ ...sanitizeRoom(null), size: { ...ROOM_DEFAULTS.size, height: 2700 } });
    expect(createRoomState({ storage: memory('not json') }).get()).toEqual(sanitizeRoom(null));
    expect(sanitizeRoom({ size: { width: 2500.5 } }).size.width).toBe(ROOM_DEFAULTS.size.width);
  });

  it('notifies only on a real change, and blocked storage is not an error', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const room = createRoomState({ storage });
    const listener = vi.fn();
    room.subscribe(listener);
    room.set({ enabled: true });
    room.set({ enabled: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
