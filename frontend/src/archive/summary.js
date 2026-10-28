// Pure helpers that turn a stored design into the numbers and text the archive shows.
import { DEFAULT_UNIT, formatLength, isUnit } from '../ui/units.js';

const total = (compartments, key) => compartments.reduce((sum, c) => sum + (Array.isArray(c[key]) ? c[key].length : 0), 0);

/** Counts and dimensions (integer mm) of a design. Tolerates missing parts: it reads untrusted storage. */
export function summarize(design) {
  const compartments = Array.isArray(design?.compartments) ? design.compartments : [];
  const doors = design?.doors ?? {};
  return {
    width: design?.dimensions?.width,
    height: design?.dimensions?.height,
    depth: design?.dimensions?.depth,
    compartments: compartments.length,
    shelves: total(compartments, 'shelves'),
    drawers: total(compartments, 'drawers'),
    rails: total(compartments, 'rails'),
    doorType: ['hinged', 'sliding', 'none'].includes(doors.type) ? doors.type : 'none',
    doors: Array.isArray(doors.items) ? doors.items.length : 0,
  };
}

/** "200.0 × 240.0 × 60.0 cm" (width × height × depth) in the chosen unit. */
export function formatSize({ width, height, depth }, unit = DEFAULT_UNIT) {
  const shown = isUnit(unit) ? unit : DEFAULT_UNIT;
  return `${[width, height, depth].map((mm) => formatLength(mm, shown)).join(' × ')} ${shown}`;
}

/** A date and time in the given language; falls back to ISO text if Intl rejects the input. */
export function formatDate(timestamp, languageCode = 'en') {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(languageCode, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}
