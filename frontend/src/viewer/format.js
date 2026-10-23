// Display formatting. The domain is integer mm; the UI shows the chosen unit.
import { toDisplay } from './units.js';

/** Legacy helper — kept for callers that haven't been migrated yet. */
export const cm = (mm) => (mm / 10).toFixed(1);

/** Format mm with the given unit ('mm' | 'cm' | 'in'). */
export const fmtVal = (mm, unit = 'cm') => toDisplay(mm, unit);

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection, unit = 'cm') {
  if (!selection) return '';
  const { id, kind } = selection;
  const f = (mm) => `${fmtVal(mm, unit)} ${unit}`;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return `Wardrobe · ${fmtVal(width, unit)} × ${fmtVal(height, unit)} × ${fmtVal(depth, unit)} ${unit}`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return `Compartment ${ci + 1} · width ${f(compartment.width)}`;
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return `Shelf · ${f(shelf.y)} from base · ${f(shelf.thickness)} thick`;
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return `Drawer · ${f(drawer.y)} from base · ${f(drawer.height)} high`;
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return `Hanging rail · ${f(rail.y)} from base`;
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return `Partition ${pi + 1} · ${f(design.partitions[pi].thickness)} thick`;
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return `${design.doors.type === 'sliding' ? 'Sliding' : 'Hinged'} door${door.hingeSide ? ` · hinge ${door.hingeSide}` : ''}`;
  return kind;
}
