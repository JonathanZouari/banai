// Plain-language answer to "where is the selected part?" ("Compartment 1 · Shelf 2 of 4"),
// plus the compartment whose row in the list should be highlighted. Pure: no DOM, no store,
// and the design is never mutated (snapshots are frozen).
//
// Numbering is 1-based and matches what the user sees: compartments run left to right (array
// order); shelves and drawers are counted bottom-up by `y` (ties keep array order).

import { insertLabel } from './interiorOps.js';

const ITEM_KEYS = Object.freeze({ shelf: 'shelves', drawer: 'drawers', rail: 'rails', insert: 'inserts' });
const ITEM_LABELS = Object.freeze({ shelf: 'מדף', drawer: 'מגירה', rail: 'מוט' });

const none = () => ({ compartmentId: null, text: '' });

/** 1-based position of `id` among `items` ordered bottom-up by y; ties keep array order. */
function bottomUpPosition(items, id) {
  const ordered = items
    .map((item, order) => ({ id: item.id, y: item.y, order }))
    .sort((a, b) => a.y - b.y || a.order - b.order);
  return ordered.findIndex((item) => item.id === id) + 1;
}

function describeItem(design, kind, id) {
  const key = ITEM_KEYS[kind];
  const index = design.compartments.findIndex((compartment) => compartment[key]?.some((item) => item.id === id));
  if (index < 0) return none();
  const compartment = design.compartments[index];
  const items = compartment[key];
  const where = `תא ${index + 1}`;
  if (kind === 'insert') return { compartmentId: compartment.id, text: `${where} · ${insertLabel(items.find((item) => item.id === id).type)}` };
  const text = kind === 'rail' && items.length === 1
    ? `${where} · מוט`
    : `${where} · ${ITEM_LABELS[kind]} ${bottomUpPosition(items, id)} מתוך ${items.length}`;
  return { compartmentId: compartment.id, text };
}

/** "1", "1–2" (an adjacent run) or "1, 3" for the compartment numbers a door covers. */
function numberList(numbers) {
  if (numbers.length === 1) return String(numbers[0]);
  const adjacent = numbers.every((number, k) => number === numbers[0] + k);
  return adjacent ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers.join(', ');
}

function describeDoor(design, id) {
  const doors = design.doors?.items ?? [];
  const doorIndex = doors.findIndex((door) => door.id === id);
  if (doorIndex < 0) return none();
  // Hinged doors list the compartments they cover; sliding doors cover none, so they are
  // described by position instead.
  const covered = [...new Set(doors[doorIndex].compartmentIds ?? [])]
    .map((compartmentId) => design.compartments.findIndex((compartment) => compartment.id === compartmentId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (!covered.length) return { compartmentId: null, text: `דלת ${doorIndex + 1} מתוך ${doors.length}` };
  const numbers = covered.map((index) => index + 1);
  return {
    compartmentId: design.compartments[covered[0]].id,
    text: `מכסה את ${numbers.length > 1 ? 'תאים' : 'תא'} ${numberList(numbers)}`,
  };
}

/**
 * Describe a store selection `{ id, kind }` against a design.
 * Returns `{ compartmentId, text }`; `compartmentId` is the compartment to highlight in the
 * list (or null) and `text` is empty when there is no selection or the id is unknown.
 */
export function describeSelection(design, selection) {
  if (!design || !Array.isArray(design.compartments) || !selection || typeof selection.id !== 'string') return none();
  const { id, kind } = selection;
  if (Object.hasOwn(ITEM_KEYS, kind)) return describeItem(design, kind, id);
  if (kind === 'compartment') {
    const index = design.compartments.findIndex((compartment) => compartment.id === id);
    return index < 0 ? none() : { compartmentId: id, text: `תא ${index + 1} מתוך ${design.compartments.length}` };
  }
  if (kind === 'partition') {
    const index = (design.partitions ?? []).findIndex((partition) => partition.id === id);
    return index < 0 ? none() : { compartmentId: null, text: `בין תא ${index + 1} לתא ${index + 2}` };
  }
  if (kind === 'door') return describeDoor(design, id);
  if (kind === 'carcass') return id === 'carcass' ? { compartmentId: null, text: 'גוף הארון' } : none();
  return none();
}
