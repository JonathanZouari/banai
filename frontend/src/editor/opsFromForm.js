// Pure mapping from editor form input to domain ops. No DOM here, so every rule is
// unit-tested. The domain engine remains the single authority on validity.
import { DOOR_SHELF_THICKNESS, LIMITS } from '../domain/defaults.js';
import { interiorHeight } from '../domain/geometry.js';
import { DOOR_SHELF, newId } from '../domain/ids.js';

const MAX_ABS_CM = 100_000;
const CM_PATTERN = /^-?\d+([.,]\d+)?$/;

// ASSUMPTION: prototype defaults for newly added items (not business rules).
export const NEW_ITEM = Object.freeze({ shelfThickness: 18, drawerHeight: 200, railBelowTop: 100 });

/** Parse a centimetre input (`.` or `,` decimal) to integer millimetres. */
export function parseCm(text) {
  const trimmed = String(text ?? '').trim();
  if (!CM_PATTERN.test(trimmed)) return { ok: false, message: 'Enter a number in cm, e.g. 64.5' };
  const cm = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(cm) || Math.abs(cm) > MAX_ABS_CM) return { ok: false, message: 'That value is too large' };
  return { ok: true, mm: Math.round(cm * 10) };
}

export const toCmText = (mm) => (mm / 10).toFixed(1);

export const dimensionOps = (field, mm) => [{ op: 'update_dimensions', [field]: mm }];

export function doorTypeOps(type, count) {
  if (type === 'sliding') return [{ op: 'configure_doors', type, count: count ?? 2 }];
  return [{ op: 'configure_doors', type }];
}

/** Change one hinged door's hinge side by re-stating every door (ids preserved). */
export function doorHingeOps(design, doorId, hingeSide) {
  return [{
    op: 'configure_doors',
    type: 'hinged',
    doors: design.doors.items.map((door) => ({
      id: door.id,
      compartmentIds: [...door.compartmentIds],
      hingeSide: door.id === doorId ? hingeSide : door.hingeSide,
    })),
  }];
}

export const materialOps = (target, field, ref) => [{ op: 'set_material', target, [field]: ref }];

export const clearAppearanceOps = (target) => [{ op: 'set_material', target, clear: true }];

export const removeOps = (id) => [{ op: 'remove_component', id }];

export function addCompartmentOps(design) {
  const last = design.compartments.at(-1);
  const thickness = design.carcass.panelThickness;
  const width = Math.floor((last.width - thickness) / 2);
  return [{ op: 'add_compartment', position: design.compartments.length, width }];
}

/** Free vertical gaps [start, end) in a compartment, given its shelves and drawers. */
function freeGaps(design, compartment) {
  return gapsBetween(design, [
    ...compartment.shelves.map((s) => [s.y, s.y + s.thickness]),
    ...compartment.drawers.map((d) => [d.y, d.y + d.height]),
  ]);
}

function gapsBetween(design, spans) {
  const top = interiorHeight(design);
  const occupied = [...spans].sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = 0;
  for (const [start, end] of occupied) {
    if (start > cursor) gaps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < top) gaps.push([cursor, top]);
  return gaps;
}

/** Ops that add a shelf, drawer or rail at a sensible free position (largest/lowest gap). */
export function addItemOps(design, compartmentId, kind) {
  const compartment = design.compartments.find((c) => c.id === compartmentId);
  const gaps = freeGaps(design, compartment);
  const largest = gaps.reduce((best, gap) => (gap[1] - gap[0] > best[1] - best[0] ? gap : best), [0, 0]);
  if (kind === 'shelf') {
    const y = Math.floor((largest[0] + largest[1] - NEW_ITEM.shelfThickness) / 2);
    return [{ op: 'add_shelf', compartmentId, y, thickness: NEW_ITEM.shelfThickness }];
  }
  if (kind === 'drawer') {
    const lowest = gaps.find(([start, end]) => end - start >= NEW_ITEM.drawerHeight) ?? largest;
    return [{ op: 'add_drawer', compartmentId, y: lowest[0], height: NEW_ITEM.drawerHeight }];
  }
  const y = Math.max(largest[0], largest[1] - NEW_ITEM.railBelowTop);
  return [{ op: 'add_rail', compartmentId, y }];
}

// --- Door shelves (on the inside face of a hinged door) ---------------------------------

// ASSUMPTION: prototype depth choices and quick layouts (configurable defaults, not business rules).
export const DOOR_SHELF_DEPTHS = Object.freeze([80, 100, 140]);
export const DOOR_SHELF_LAYOUTS = Object.freeze([
  { key: 'spice', label: 'Spice rack', depth: 80, at: [0.2, 0.32, 0.44, 0.56, 0.68] },
  { key: 'even3', label: 'Even ×3', depth: 100, at: [0.25, 0.5, 0.75] },
  { key: 'topBottom', label: 'Top & bottom', depth: 100, at: [0.15, 0.8] },
]);

const doorShelfSpans = (door) => door.shelves.map((s) => [s.y, s.y + DOOR_SHELF_THICKNESS]);

/** The free gap where "+ Door shelf" puts the next shelf (the largest one), or null. */
export function nextDoorShelfGap(design, door) {
  const gaps = gapsBetween(design, doorShelfSpans(door)).filter(([a, b]) => b - a >= DOOR_SHELF_THICKNESS);
  return gaps.reduce((best, gap) => (!best || gap[1] - gap[0] > best[1] - best[0] ? gap : best), null);
}

export function addDoorShelfOps(design, doorId) {
  const door = design.doors.items.find((d) => d.id === doorId);
  const gap = nextDoorShelfGap(design, door) ?? [0, DOOR_SHELF_THICKNESS];
  const y = Math.floor((gap[0] + gap[1] - DOOR_SHELF_THICKNESS) / 2);
  return [{ op: 'add_door_shelf', doorId, y, id: newId(DOOR_SHELF) }];
}

/** One atomic batch adding a quick layout's shelves, or null when it would hit existing ones. */
export function doorShelfLayoutOps(design, doorId, key) {
  const layout = DOOR_SHELF_LAYOUTS.find((l) => l.key === key);
  const door = design.doors.items.find((d) => d.id === doorId);
  const top = interiorHeight(design);
  const ys = layout.at.map((f) => Math.floor(f * top));
  const taken = doorShelfSpans(door);
  const collides = ys.some((y) => taken.some(([a, b]) => y < b && a < y + DOOR_SHELF_THICKNESS));
  if (collides) return null;
  return ys.map((y) => ({ op: 'add_door_shelf', doorId, y, depth: layout.depth }));
}

export const doorShelfDepthRange = () => LIMITS.doorShelfDepth;

const FRIENDLY = Object.freeze({
  OVERLAP: 'That would overlap another shelf or drawer. Choose a different position.',
  OUT_OF_BOUNDS: 'That position is not inside the wardrobe.',
  OUT_OF_RANGE: 'That value is outside the allowed range.',
  WIDTH_MISMATCH: 'The widths no longer add up to the wardrobe width.',
  DOOR_INVALID: 'That door arrangement is not possible here.',
  NOT_FOUND: 'That component no longer exists.',
  INVALID_OP: 'That change is not possible for this component.',
  UNKNOWN_CATALOG_ID: 'That material or colour is not in the catalog.',
  SCHEMA_INVALID: 'That value is not valid.',
});

const FRIENDLY_DOOR_SHELF = Object.freeze({
  OVERLAP: "Door shelves can't overlap. Choose a different height.",
  OUT_OF_BOUNDS: 'That height is not inside the door.',
  OUT_OF_RANGE: `Door shelf depth must be ${LIMITS.doorShelfDepth[0] / 10}–${LIMITS.doorShelfDepth[1] / 10} cm.`,
  INVALID_OP: 'Door shelves need hinged doors.',
});

/**
 * Short, engine-independent message for an inline error (never echoes input). The path is
 * engine-generated, so it can pick a more specific message for door shelves.
 */
export function friendlyError(error) {
  const onDoorShelf = /^doors\.items\[\d+\]\.shelves/.test(error?.path ?? '') || /\.doorId$/.test(error?.path ?? '');
  return (onDoorShelf && FRIENDLY_DOOR_SHELF[error.code]) || FRIENDLY[error?.code] || 'The change could not be applied.';
}
