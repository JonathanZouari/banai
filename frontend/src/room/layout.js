// Room geometry around the wardrobe, in millimetres and in the viewer's frame: the wardrobe keeps
// its own coordinates (x from its outer left face, y up from the floor, front at z = 0, back at
// z = -depth) and the room is built around it, never the other way round. Pure: no three.js.
//
// ASSUMPTION: every size here is a visual prototype value, not a rule about the design.

export const WALL_GAP = 5; // between the wardrobe's back and the back wall
export const WARDROBE_FRONT = 60; // doors and handles stand this far in front of the carcass
const SIDE_GAP = 50; // smallest gap beside the wardrobe
const DOOR = Object.freeze({ width: 850, height: 2050, fromCorner: 250 });

/** The smallest room the wardrobe fits in (the room never shrinks below it). */
export function minimumRoom(design) {
  const { width, height, depth } = design.dimensions;
  return { width: width + 2 * SIDE_GAP, length: depth + WALL_GAP + WARDROBE_FRONT + 1000, height: height + 20 };
}

/** The wardrobe's floor footprint (x0..x1, z0..z1), doors and handles included. */
export function wardrobeFootprint(design) {
  return { x0: 0, x1: design.dimensions.width, z0: -design.dimensions.depth, z1: WARDROBE_FRONT };
}

/**
 * The room box for this wardrobe and room setup: walls (x0, x1, zBack, zFront), ceiling height,
 * the window (right wall) and the doorway (front wall, far from the window). `clamped` lists the
 * sizes raised to fit the wardrobe.
 */
export function roomBox(design, room) {
  const min = minimumRoom(design);
  const size = {};
  const clamped = [];
  ['width', 'length', 'height'].forEach((key) => {
    size[key] = Math.max(room.size[key], min[key]);
    if (size[key] > room.size[key]) clamped.push(key);
  });
  const { width: w, depth: d } = design.dimensions;
  const freeSide = size.width - w;
  const left = { left: SIDE_GAP, centre: freeSide / 2, right: freeSide - SIDE_GAP }[room.wardrobeAt] ?? freeSide / 2;
  const x0 = -Math.min(Math.max(left, SIDE_GAP), freeSide - SIDE_GAP);
  const zBack = -d - WALL_GAP;
  const box = { x0, x1: x0 + size.width, zBack, zFront: zBack + size.length, height: size.height, size, clamped };

  // Window on the right wall, in the front half of the room's depth, sill at desk height.
  const windowWidth = Math.min(1600, Math.round(size.length * 0.38));
  const windowStart = Math.max(Math.round(size.length * 0.24), d + WALL_GAP + WARDROBE_FRONT + 400);
  const top = Math.min(2150, size.height - 250);
  box.window = { z0: zBack + windowStart, z1: zBack + Math.min(windowStart + windowWidth, size.length - 300), y0: Math.min(900, top - 700), y1: top };
  // Doorway in the front wall, near the left corner (the window is on the right).
  box.door = { x0: box.x0 + DOOR.fromCorner, x1: box.x0 + DOOR.fromCorner + DOOR.width, height: Math.min(DOOR.height, size.height - 100) };
  return box;
}

/** Axis-aligned rectangles on the floor: { x0, x1, z0, z1 }. Touching is not overlapping. */
export const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
export const insideRoom = (rect, box) => rect.x0 >= box.x0 && rect.x1 <= box.x1 && rect.z0 >= box.zBack && rect.z1 <= box.zFront;
