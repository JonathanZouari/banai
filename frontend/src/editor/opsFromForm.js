// Pure mapping from editor form input to domain ops. No DOM here, so every rule is
// unit-tested. The domain engine remains the single authority on validity.
import { interiorHeight } from '../domain/geometry.js';

const MAX_ABS_CM = 100_000;
const CM_PATTERN = /^-?\d+([.,]\d+)?$/;

// ASSUMPTION: prototype defaults for newly added items (not business rules).
// A new shelf is cut from the carcass board (its panelThickness), so the cut list keeps one board.
export const NEW_ITEM = Object.freeze({ drawerHeight: 200, railBelowTop: 100 });

/** Parse a centimetre input (`.` or `,` decimal) to integer millimetres. */
export function parseCm(text) {
  const trimmed = String(text ?? '').trim();
  if (!CM_PATTERN.test(trimmed)) return { ok: false, message: 'הזינו מספר בס״מ, למשל 64.5' };
  const cm = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(cm) || Math.abs(cm) > MAX_ABS_CM) return { ok: false, message: 'הערך גדול מדי' };
  return { ok: true, mm: Math.round(cm * 10) };
}

export const toCmText = (mm) => (mm / 10).toFixed(1);

export const dimensionOps = (field, mm) => [{ op: 'update_dimensions', [field]: mm }];

export function doorTypeOps(type, count) {
  if (type === 'sliding') return [{ op: 'configure_doors', type, count: count ?? 2 }];
  return [{ op: 'configure_doors', type }];
}

/** Change one door in place (hinge side and/or mirror); every other door and override is kept. */
export const modifyDoorOps = (id, changes) => [{ op: 'modify_door', id, ...changes }];

/** Change one hinged door's hinge side. The `design` argument is no longer needed and is ignored. */
export const doorHingeOps = (_design, doorId, hingeSide) => modifyDoorOps(doorId, { hingeSide });

/** Turn the mirror front of one door on or off. */
export const doorMirrorOps = (doorId, mirror) => modifyDoorOps(doorId, { mirror });

// Handle styles and finishes as offered in the editor (ids from the domain schema).
export const HANDLE_STYLE_OPTIONS = Object.freeze([
  { value: 'bar', label: 'מוט' },
  { value: 'knob', label: 'כפתור' },
  { value: 'edge', label: 'פרופיל' },
  { value: 'cup', label: 'שקע' },
  { value: 'groove', label: 'חריץ' },
  { value: 'none', label: 'ללא (לחיצה)' },
]);
export const HANDLE_FINISH_OPTIONS = Object.freeze([
  { value: 'steel', label: 'נירוסטה' },
  { value: 'black', label: 'שחור' },
  { value: 'brass', label: 'פליז' },
]);

/** Set the handle style and/or finish of `target`: 'all' (the wardrobe), a door id or a drawer id. */
export const handleOps = (target, changes) => [{ op: 'set_handles', target, ...changes }];

/** Remove a door's or drawer's own handle so it follows the wardrobe handles again. */
export const clearHandleOps = (target) => [{ op: 'set_handles', target, clear: true }];

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
    const thickness = design.carcass.panelThickness;
    const y = Math.floor((largest[0] + largest[1] - thickness) / 2);
    return [{ op: 'add_shelf', compartmentId, y, thickness }];
  }
  if (kind === 'drawer') {
    const lowest = gaps.find(([start, end]) => end - start >= NEW_ITEM.drawerHeight) ?? largest;
    return [{ op: 'add_drawer', compartmentId, y: lowest[0], height: NEW_ITEM.drawerHeight }];
  }
  const y = Math.max(largest[0], largest[1] - NEW_ITEM.railBelowTop);
  return [{ op: 'add_rail', compartmentId, y }];
}

const FRIENDLY = Object.freeze({
  OVERLAP: 'זה חופף למדף, למגירה או לרכיב אחר. בחרו מיקום אחר.',
  OUT_OF_BOUNDS: 'המיקום הזה מחוץ לארון.',
  OUT_OF_RANGE: 'הערך מחוץ לטווח המותר.',
  WIDTH_MISMATCH: 'סכום הרוחבים לא מתאים לרוחב הארון.',
  DOOR_INVALID: 'סידור הדלתות הזה לא אפשרי כאן.',
  NOT_FOUND: 'הרכיב הזה כבר לא קיים.',
  INVALID_OP: 'השינוי הזה לא אפשרי ברכיב הזה.',
  INSERT_INVALID: 'הרכיב הזה לא מתאים כאן: יש כבר אחד כזה בתא, או שחסר לו מידע.',
  UNKNOWN_CATALOG_ID: 'החומר או הצבע לא נמצאים בקטלוג.',
  SCHEMA_INVALID: 'הערך לא תקין.',
});

/** Short, engine-independent message for an inline error (never echoes input). */
export const friendlyError = (error) => FRIENDLY[error?.code] ?? 'לא ניתן להחיל את השינוי.';
