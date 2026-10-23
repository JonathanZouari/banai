// Pure slider ranges for the centimetre fields (no DOM). All values are integer millimetres.
// A range is only a hint for the control: the domain engine stays the final judge, so a value
// the slider allows can still be rejected (and is then shown as an inline error).
import { LIMITS } from '../domain/defaults.js';
import { interiorHeight } from '../domain/geometry.js';

/** One arrow-key / drag step: 1 cm. */
export const SLIDER_STEP_MM = 10;
/** PageUp / PageDown: 10 cm. */
export const SLIDER_PAGE_MM = 100;

/**
 * Normalise a { min, max, step } range. `max` is lowered onto the step grid (`min + k * step`),
 * because that is the largest value a range input can actually reach. Returns null when the
 * input is not a usable range.
 */
export function normalizeRange({ min, max, step = SLIDER_STEP_MM } = {}) {
  if (![min, max, step].every(Number.isFinite) || step < 1 || max < min) return null;
  const low = Math.round(min);
  const stepMm = Math.round(step);
  const span = Math.max(0, Math.floor((max - low) / stepMm)) * stepMm;
  return { min: low, max: low + span, step: stepMm };
}

/** Clamp a value into a range (no snapping). */
export const clampToRange = (value, range) => Math.min(range.max, Math.max(range.min, value));

/** Snap a value onto the range's step grid, inside the range. */
export function snapToRange(value, range) {
  const clamped = clampToRange(value, range);
  const steps = Math.round((clamped - range.min) / range.step);
  return Math.min(range.max, range.min + steps * range.step);
}

/**
 * PageUp (+1) / PageDown (-1): move by `page` from the current value, kept on the step grid
 * and inside the range. Returns the current (snapped) value when it cannot move.
 */
export function pageStep(value, direction, range, page = SLIDER_PAGE_MM) {
  return snapToRange(snapToRange(value, range) + direction * page, range);
}

/** Overall width, height or depth: the domain limits. */
export const dimensionRange = (field) => {
  const limits = LIMITS[field];
  return limits ? normalizeRange({ min: limits[0], max: limits[1] }) : null;
};

/**
 * Height from base of a shelf, drawer or rail: from the floor of the interior up to the
 * highest position where the item still fits under the top panel.
 */
export function itemYRange(design, kind, item) {
  const top = interiorHeight(design);
  const size = kind === 'shelf' ? item.thickness : kind === 'drawer' ? item.height : 0;
  return normalizeRange({ min: 0, max: Math.max(0, top - size) });
}

/**
 * Width of one compartment. Resizing takes the difference from its right neighbour (from its
 * left neighbour for the last compartment), so the widest it can get is where that neighbour
 * is down to the minimum width. A single compartment cannot be resized: null (no slider).
 */
export function compartmentWidthRange(design, compartmentId) {
  const all = design.compartments;
  const index = all.findIndex((compartment) => compartment.id === compartmentId);
  if (index < 0 || all.length < 2) return null;
  const neighbour = index < all.length - 1 ? all[index + 1] : all[index - 1];
  const [minWidth, maxWidth] = LIMITS.compartmentWidth;
  const widest = Math.min(maxWidth, all[index].width + neighbour.width - minWidth);
  return normalizeRange({ min: minWidth, max: widest });
}
