// Pure mapping from editor form input to domain ops. No DOM here, so every rule is
// unit-tested. The domain engine remains the single authority on validity.
import { applyOps } from '../domain/apply.js';
import { LIMITS } from '../domain/defaults.js';
import { DomainError } from '../domain/errors.js';
import { interiorHeight } from '../domain/geometry.js';
import { DOOR, newId } from '../domain/ids.js';
import { formatLength, parseLength } from '../ui/units.js';
import { t, tf } from '../i18n/strings.js';


// ASSUMPTION: prototype defaults for newly added items (not business rules).
export const NEW_ITEM = Object.freeze({ shelfThickness: 18, drawerHeight: 200, railBelowTop: 100 });

/** Parse a centimetre input (`.` or `,` decimal) to integer millimetres. */
export const parseCm = (text) => parseLength(text, 'cm');

export const toCmText = (mm) => formatLength(mm, 'cm');

export const dimensionOps = (field, mm) => [{ op: 'update_dimensions', [field]: mm }];

// ASSUMPTION: common wardrobe sizes offered as one-click chips, in mm (configurable defaults, not
// business rules: any value inside LIMITS can still be typed).
export const DIMENSION_PRESETS = Object.freeze({
  width: Object.freeze([1000, 1500, 2000, 2400, 3000]),
  height: Object.freeze([2000, 2200, 2400, 2600]),
  depth: Object.freeze([450, 550, 600, 650]),
});

/**
 * The common sizes for one dimension, each dry-run through the domain engine on a copy of the design:
 * `ok: false` (with the engine's `error`) means dispatching it would be rejected, so the chip is disabled.
 */
export function dimensionChips(design, catalog, field) {
  const [min, max] = LIMITS[field];
  return DIMENSION_PRESETS[field].filter((mm) => mm >= min && mm <= max).map((mm) => {
    const active = design.dimensions[field] === mm;
    if (active) return { mm, active, ok: true };
    try {
      applyOps(design, dimensionOps(field, mm), catalog);
      return { mm, active, ok: true };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return { mm, active, ok: false, error };
    }
  });
}

export function doorTypeOps(type, count) {
  if (type === 'sliding') return [{ op: 'configure_doors', type, count: count ?? 2 }];
  return [{ op: 'configure_doors', type }];
}

/** A new sliding-panel count that keeps the existing panels (and their fronts) and adds or drops at the end. */
export function slidingCountOps(design, count) {
  const kept = design.doors.items.slice(0, count).map((door) => door.id);
  const ids = [...kept, ...Array.from({ length: Math.max(0, count - kept.length) }, () => newId(DOOR))];
  return [{ op: 'configure_doors', type: 'sliding', count, ids }];
}

export const handleOps = (field, id) => [{ op: 'set_handles', [field]: id }];

export const doorFrontOps = (doorId, front) => [{ op: 'modify_door', id: doorId, front }];

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
  const top = interiorHeight(design);
  const occupied = [
    ...compartment.shelves.map((s) => [s.y, s.y + s.thickness]),
    ...compartment.drawers.map((d) => [d.y, d.y + d.height]),
  ].sort((a, b) => a[0] - b[0]);
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

// ASSUMPTION: prototype quick-layout proportions (configurable defaults, not business rules).
export const LAYOUT = Object.freeze({ topShelfGap: 300, railBelowShelf: 60, shelfSpacing: 350, drawerCount: 3 });
export const LAYOUTS = Object.freeze(['hanging', 'shelves', 'drawers']);

/** `count` shelves spread evenly between `from` and `to` (shelf tops never pass `to`). */
function evenShelves(compartmentId, from, to, count) {
  const thickness = NEW_ITEM.shelfThickness;
  const step = (to - from) / (count + 1);
  return Array.from({ length: count }, (_, i) => ({
    op: 'add_shelf', compartmentId, y: Math.round(from + step * (i + 1) - thickness / 2), thickness,
  }));
}

/**
 * Replace a compartment's contents with a ready-made layout, in one change (one Undo):
 * - hanging: a top shelf with a hanging rail under it
 * - shelves: shelves spread evenly over the full height
 * - drawers: a stack of drawers at the bottom, shelves above
 */
export function layoutOps(design, compartmentId, layout) {
  const compartment = design.compartments.find((c) => c.id === compartmentId);
  if (!compartment || !LAYOUTS.includes(layout)) return [];
  const top = interiorHeight(design);
  const thickness = NEW_ITEM.shelfThickness;
  const clear = [...compartment.shelves, ...compartment.drawers, ...compartment.rails].map((item) => ({ op: 'remove_component', id: item.id }));
  let add;
  if (layout === 'hanging') {
    const shelfY = Math.max(thickness, top - LAYOUT.topShelfGap - thickness);
    add = [
      { op: 'add_shelf', compartmentId, y: shelfY, thickness },
      { op: 'add_rail', compartmentId, y: Math.max(0, shelfY - LAYOUT.railBelowShelf) },
    ];
  } else if (layout === 'shelves') {
    add = evenShelves(compartmentId, 0, top, Math.max(1, Math.floor(top / LAYOUT.shelfSpacing) - 1));
  } else {
    const drawers = Math.max(1, Math.min(LAYOUT.drawerCount, Math.floor(top / 2 / NEW_ITEM.drawerHeight)));
    const stack = drawers * NEW_ITEM.drawerHeight;
    add = [
      ...Array.from({ length: drawers }, (_, i) => ({ op: 'add_drawer', compartmentId, y: i * NEW_ITEM.drawerHeight, height: NEW_ITEM.drawerHeight })),
      ...evenShelves(compartmentId, stack, top, Math.max(0, Math.floor((top - stack) / LAYOUT.shelfSpacing) - 1)),
    ];
  }
  return [...clear, ...add];
}

const FRIENDLY = Object.freeze({
  OVERLAP: 'feOverlap',
  OUT_OF_BOUNDS: 'feOutOfBounds',
  OUT_OF_RANGE: 'feOutOfRange',
  WIDTH_MISMATCH: 'feWidthMismatch',
  DOOR_INVALID: 'feDoorInvalid',
  NOT_FOUND: 'feNotFound',
  INVALID_OP: 'feInvalidOp',
  UNKNOWN_CATALOG_ID: 'feUnknownCatalog',
  SCHEMA_INVALID: 'feSchema',
});

/** Short, engine-independent message for an inline error in the selected language (never echoes input). */
export const friendlyError = (error) => t(FRIENDLY[error?.code] ?? 'feGeneric');

/** Why a common-size chip is disabled, in the selected language (the generic engine messages talk about positions). */
export function chipReason(error) {
  if (error?.code === 'OUT_OF_BOUNDS') return t('edPresetNoFitItems');
  if (error?.code === 'OUT_OF_RANGE' || error?.code === 'WIDTH_MISMATCH') return t('edPresetNoFitCompartments');
  return friendlyError(error);
}

/** Localized text for a failed length parse (see parseLength). */
export const parseMessage = (failure) => (failure.code === 'NOT_A_NUMBER' ? tf('feEnterNumber', { unit: failure.unit, example: failure.example }) : t('feTooLarge'));
