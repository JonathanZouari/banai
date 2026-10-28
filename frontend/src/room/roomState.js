// The room around the wardrobe: decoration only. It lives here, never in the design store: it is
// not part of the design, not saved with it, not sent to the server and never in the PDF or the
// template thumbnails. The setup is remembered per browser (best effort) and validated on read.

import { PRESET_IDS } from './placement.js';
import { VIEW_IDS } from './views.js';
import { FLOOR_IDS, LIGHT_IDS, WALL_IDS } from './look.js';

const STORAGE_KEY = 'banai.room.v1';

// ASSUMPTION: visual defaults (mm), not business rules.
export const ROOM_DEFAULTS = Object.freeze({
  enabled: false, // off by default: the existing viewer is unchanged until someone opens the room
  size: Object.freeze({ width: 4000, length: 4400, height: 2600 }),
  wardrobeAt: 'centre',
  preset: 'couple',
  view: 'doorway',
  wall: 'warm',
  floor: 'wood',
  light: 'morning',
  hintSeen: false,
});
export const ROOM_SIZE_LIMITS = Object.freeze({ width: [2000, 8000], length: [2000, 8000], height: [2200, 4000] });
export const WARDROBE_POSITIONS = Object.freeze(['left', 'centre', 'right']);

const isInt = (value) => Number.isInteger(value);
const inRange = (value, [min, max]) => isInt(value) && value >= min && value <= max;

/** Keep only known, well-formed fields; anything else falls back to the defaults. */
export function sanitizeRoom(raw) {
  const room = raw && typeof raw === 'object' ? raw : {};
  const size = room.size && typeof room.size === 'object' ? room.size : {};
  return {
    enabled: room.enabled === true,
    size: Object.fromEntries(Object.entries(ROOM_DEFAULTS.size).map(([key, fallback]) => [
      key, inRange(size[key], ROOM_SIZE_LIMITS[key]) ? size[key] : fallback,
    ])),
    wardrobeAt: WARDROBE_POSITIONS.includes(room.wardrobeAt) ? room.wardrobeAt : ROOM_DEFAULTS.wardrobeAt,
    preset: PRESET_IDS.includes(room.preset) ? room.preset : ROOM_DEFAULTS.preset,
    view: VIEW_IDS.includes(room.view) ? room.view : ROOM_DEFAULTS.view,
    wall: WALL_IDS.includes(room.wall) ? room.wall : ROOM_DEFAULTS.wall,
    floor: FLOOR_IDS.includes(room.floor) ? room.floor : ROOM_DEFAULTS.floor,
    light: LIGHT_IDS.includes(room.light) ? room.light : ROOM_DEFAULTS.light,
    hintSeen: room.hintSeen === true,
  };
}

/** A small observable store for the room setup. `storage` is injectable for tests. */
export function createRoomState({ storage = globalThis.localStorage } = {}) {
  let state;
  try {
    state = sanitizeRoom(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    state = sanitizeRoom(null); // unreadable or blocked storage: defaults
  }
  const listeners = new Set();
  const save = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // not remembered; the room still works for this visit
    }
  };
  return {
    get: () => state,
    /** Merge a partial update (validated), remember it and notify. */
    set(patch) {
      const next = sanitizeRoom({ ...state, ...patch, size: { ...state.size, ...(patch.size ?? {}) } });
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      save();
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
