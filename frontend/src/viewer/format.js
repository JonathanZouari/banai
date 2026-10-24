// Display formatting. The domain is integer mm; the UI shows centimetres (1 decimal).
import { t } from '../ui/i18n.js';
export const cm = (mm) => (mm / 10).toFixed(1);

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  const v = t().viewer;
  if (kind === 'carcass') return v.carcass(cm(width), cm(height), cm(depth));
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return v.compartment(ci + 1, cm(compartment.width));
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return v.shelf(cm(shelf.y), cm(shelf.thickness));
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return v.drawer(cm(drawer.y), cm(drawer.height));
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return v.rail(cm(rail.y));
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return v.partition(pi + 1, cm(design.partitions[pi].thickness));
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return v.door(design.doors.type === 'sliding', door.hingeSide);
  return kind;
}
