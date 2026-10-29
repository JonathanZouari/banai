// The properties panel as five steps (progressive disclosure). Each closed step shows a one-line
// summary of its current choices, so the panel doubles as a live design summary. Pure: no DOM.
import { LIMITS } from '../domain/defaults.js';
import { catalogName, t } from '../ui/i18n.js';
import { formatLength } from '../units/displayUnits.js';
import { ltr } from '../ui/bidi.js';

export const STEPS = Object.freeze(['dimensions', 'doors', 'interior', 'materials', 'notes']);

/** [min, max] text in the display unit for an overall dimension ('width' | 'height' | 'depth'), no trailing zeros. */
export const rangeIn = (field, unit = 'cm') => LIMITS[field].map((mm) => String(Number(formatLength(mm, unit))));

/** [min, max] in whole centimetres (limits are whole cm). */
export const rangeCm = (field) => rangeIn(field, 'cm');

function refName(ref, list) {
  if (!ref) return '';
  if (ref.custom) return ref.name;
  const entry = list.find((item) => item.id === ref.catalogId);
  return entry ? catalogName(entry) : '';
}

/** One summary line per step, in the current UI language. */
export function stepSummaries(design, catalog, notes = '', unit = 'cm') {
  const s = t().editor;
  const { width, height, depth } = design.dimensions;
  const count = (kind) => design.compartments.reduce((total, compartment) => total + compartment[kind].length, 0);
  const doorCount = design.doors.items.length;
  const doors = design.doors.type === 'none'
    ? s.summary.noDoors
    : `${s.doorTypes[design.doors.type]} · ${design.doors.type === 'sliding' ? s.summary.panels(doorCount) : s.summary.doors(doorCount)}`;
  const interior = [
    s.summary.compartments(design.compartments.length),
    ...[['shelves', s.summary.shelves], ['rails', s.summary.rails], ['drawers', s.summary.drawers]]
      .map(([kind, label]) => [count(kind), label])
      .filter(([n]) => n > 0)
      .map(([n, label]) => label(n)),
  ].join(' · ');
  const { appearance } = design.carcass;
  const materials = [
    refName(appearance.material, catalog.materials),
    refName(appearance.color, catalog.colors),
    refName(appearance.finish, catalog.finishes),
  ].filter(Boolean).join(' · ');
  const trimmed = notes.trim().replace(/\s+/g, ' ');
  return {
    dimensions: `${ltr(`${formatLength(width, unit)} × ${formatLength(height, unit)} × ${formatLength(depth, unit)}`)} ${t().units[unit]}`,
    doors,
    interior,
    materials,
    notes: trimmed ? (trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed) : s.summary.noNotes,
  };
}
