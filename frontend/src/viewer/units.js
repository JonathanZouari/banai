// The domain uses integer millimetres; the scene uses metres (Y up).
export const MM_TO_M = 0.001;
export const toM = (mm) => mm * MM_TO_M;

/** Display units the user can choose from. The domain always stores integer mm. */
export const UNITS = /** @type {const} */ (['mm', 'cm', 'in']);

/** Format an integer mm value as a display string (no suffix). */
export function toDisplay(mm, unit) {
  if (unit === 'mm') return String(mm);
  if (unit === 'cm') return (mm / 10).toFixed(1);
  return (mm / 25.4).toFixed(2); // inches
}

/**
 * Parse a display string back to integer mm.
 * Accepts `.` or `,` as decimal separator.
 * Returns { ok: true, mm } or { ok: false, message }.
 */
export function fromDisplay(text, unit) {
  const trimmed = String(text ?? '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false, message: `Enter a number in ${unit}, e.g. ${unit === 'in' ? '24.00' : unit === 'cm' ? '64.5' : '640'}` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) {
    return { ok: false, message: 'That value is too large' };
  }
  let mm;
  if (unit === 'mm') mm = Math.round(value);
  else if (unit === 'cm') mm = Math.round(value * 10);
  else mm = Math.round(value * 25.4); // inches
  return { ok: true, mm };
}

// ASSUMPTION: visual-only prototype values. They are NOT part of the design model and
// are not manufacturing specifications; they only make the render readable.
export const VISUAL = Object.freeze({
  backThickness: 6,
  doorThickness: 18,
  doorGap: 2,
  drawerGap: 3,
  railRadius: 12,
  slidingTrackGap: 4,
  slidingOverlap: 60,
  slidingRailHeight: 20,
  handleWidth: 14,
  handleDepth: 12,
  handleLength: 400,
  handleHeightFromFloor: 1050,
  handleInset: 40,
});
