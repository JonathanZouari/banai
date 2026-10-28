// Display formatting. The domain is integer mm; the UI shows centimetres (1 decimal).
import { strings } from '../ui/i18n.js';

export const cm = (mm) => (mm / 10).toFixed(1);

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const t = strings();
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return t.describeWardrobe(cm(width), cm(height), cm(depth));
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return t.describeCompartment(ci + 1, cm(compartment.width));
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return t.describeShelf(cm(shelf.y), cm(shelf.thickness));
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return t.describeDrawer(cm(drawer.y), cm(drawer.height));
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return t.describeRail(cm(rail.y));
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return t.describePartition(pi + 1, cm(design.partitions[pi].thickness));
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return t.describeDoor(design.doors.type === 'sliding', door.hingeSide);
  return kind;
}
