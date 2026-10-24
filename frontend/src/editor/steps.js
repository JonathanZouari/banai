// The properties panel as five steps (progressive disclosure). Each closed step shows a one-line
// summary of its current choices, so the panel doubles as a live design summary. Pure: no DOM.
import { LIMITS } from '../domain/defaults.js';
import { catalogName, t } from '../ui/i18n.js';
import { toCmText } from './opsFromForm.js';
import { ltr } from '../ui/bidi.js';

export const STEPS = Object.freeze(['dimensions', 'doors', 'interior', 'materials', 'notes']);

/** Whole centimetres for range text (limits are whole cm). */
const cm = (mm) => String(Math.round(mm / 10));

/** [min, max] in cm text for an overall dimension ('width' | 'height' | 'depth'). */
export const rangeCm = (field) => LIMITS[field].map(cm);

function refName(ref, list) {
  if (!ref) return '';
  if (ref.custom) return ref.name;
  const entry = list.find((item) => item.id === ref.catalogId);
  return entry ? catalogName(entry) : '';
}

/** One summary line per step, in the current UI language. */
export function stepSummaries(design, catalog, notes = '') {
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
    dimensions: `${ltr(`${toCmText(width)} × ${toCmText(height)} × ${toCmText(depth)}`)} ${t().units.cm}`,
    doors,
    interior,
    materials,
    notes: trimmed ? (trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed) : s.summary.noNotes,
  };
}
