// Position of the illustrative wardrobe layer on the room photo, as fractions of the photo area:
// { x, y } is the centre and `height` the layer's height. Pure, so moving and resizing are unit-tested.
// It is a visual aid only: it is never converted into a measurement.

export const DEFAULT_OVERLAY = Object.freeze({ x: 0.5, y: 0.55, height: 0.6 });
export const MOVE_STEP = 0.02;
export const RESIZE_FACTOR = 1.08;
const HEIGHT_RANGE = [0.1, 1.5];

const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

export function moveOverlay(overlay, dx, dy) {
  return { ...overlay, x: clamp(overlay.x + dx, [0, 1]), y: clamp(overlay.y + dy, [0, 1]) };
}

export function resizeOverlay(overlay, factor) {
  return { ...overlay, height: clamp(overlay.height * factor, HEIGHT_RANGE) };
}

/** Keyboard: arrows move, +/- resize. Returns the new overlay, or null for other keys. */
export function overlayForKey(overlay, key) {
  switch (key) {
    case 'ArrowUp': return moveOverlay(overlay, 0, -MOVE_STEP);
    case 'ArrowDown': return moveOverlay(overlay, 0, MOVE_STEP);
    case 'ArrowLeft': return moveOverlay(overlay, -MOVE_STEP, 0);
    case 'ArrowRight': return moveOverlay(overlay, MOVE_STEP, 0);
    case '+': case '=': return resizeOverlay(overlay, RESIZE_FACTOR);
    case '-': case '_': return resizeOverlay(overlay, 1 / RESIZE_FACTOR);
    default: return null;
  }
}
