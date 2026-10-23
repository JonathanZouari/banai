// The domain uses integer millimetres; the scene uses metres (Y up).
export const MM_TO_M = 0.001;
export const toM = (mm) => mm * MM_TO_M;

// Display units: a view preference only. The design always stays in integer millimetres.
// `decimals` is fine enough that text -> mm -> text round-trips exactly (0.01 in < 0.5 mm).
export const DISPLAY_UNITS = Object.freeze({
  cm: Object.freeze({ label: 'cm', name: 'cm', mmPerUnit: 10, decimals: 1, example: '64.5' }),
  mm: Object.freeze({ label: 'mm', name: 'mm', mmPerUnit: 1, decimals: 0, example: '645' }),
  in: Object.freeze({ label: 'in', name: 'inches', mmPerUnit: 25.4, decimals: 2, example: '25.4' }),
});
export const DEFAULT_UNIT = 'cm';
export const isDisplayUnit = (unit) => Object.hasOwn(DISPLAY_UNITS, unit);

/** Integer mm -> display text in `unit` (fixed decimals). */
export const mmToUnitText = (mm, unit = DEFAULT_UNIT) =>
  (mm / DISPLAY_UNITS[unit].mmPerUnit).toFixed(DISPLAY_UNITS[unit].decimals);

/** A value in `unit` -> integer mm (the only form the design accepts). */
export const unitToMm = (value, unit = DEFAULT_UNIT) => Math.round(value * DISPLAY_UNITS[unit].mmPerUnit);

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
