// Pure helpers for the on-canvas dimension steppers (no DOM, no WebGL).

/** Size of one stepper press, in millimetres, and of a Shift-press. */
export const STEP_MM = 10;
export const SHIFT_STEP_MM = 100;

/** Press-and-hold timing: pause before the first repeat, then repeats that speed up to a floor. */
export const HOLD_DELAY_MS = 400;
export const REPEAT_START_MS = 120;
export const REPEAT_MIN_MS = 50;
const REPEAT_DECAY = 0.9;

/** Magnitude of one step: 10 mm, or 100 mm while Shift is held. */
export const stepDelta = (shiftKey) => (shiftKey ? SHIFT_STEP_MM : STEP_MM);

/** True when `value + deltaMm` stays inside the inclusive [min, max] range. Never true for a non-finite input. */
export function canStep(value, deltaMm, limits) {
  if (!Array.isArray(limits) || limits.length < 2) return false;
  const next = value + deltaMm;
  return Number.isFinite(next) && next >= limits[0] && next <= limits[1];
}

/**
 * Delay (ms) before repeat number `count` (0-based) of a held button: 400 before the first
 * repeat, 120 before the second, then shrinking by 10% per repeat down to 50.
 */
export function repeatDelay(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (n === 0) return HOLD_DELAY_MS;
  return Math.max(REPEAT_MIN_MS, Math.round(REPEAT_START_MS * REPEAT_DECAY ** (n - 1)));
}
