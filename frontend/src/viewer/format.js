// Display formatting. The domain is integer mm; the UI shows the chosen display unit (cm, mm or in).
import { t } from '../ui/i18n.js';
import { formatLength } from '../units/displayUnits.js';

/** Backwards-compatible alias: millimetres as centimetres with 1 decimal, e.g. `'64.3'`. */
export const cm = (mm) => formatLength(mm, 'cm');

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection, unit = 'cm') {
  const n = (mm) => formatLength(mm, unit);
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  const v = t().viewer;
  const name = t().units[unit] ?? unit;
  if (kind === 'carcass') return v.carcass(n(width), n(height), n(depth), name);
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return v.compartment(ci + 1, n(compartment.width), name);
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return v.shelf(n(shelf.y), n(shelf.thickness), name);
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return v.drawer(n(drawer.y), n(drawer.height), name);
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return v.rail(n(rail.y), name);
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return v.partition(pi + 1, n(design.partitions[pi].thickness), name);
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return v.door(design.doors.type === 'sliding', door.hingeSide);
  return kind;
}
