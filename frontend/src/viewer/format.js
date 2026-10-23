// Display formatting. The domain is integer mm; the UI shows the chosen display unit.
import { DEFAULT_UNIT, DISPLAY_UNITS, mmToUnitText } from './units.js';

/** "64.3 cm", "643 mm" or "25.31 in". */
export const length = (mm, unit = DEFAULT_UNIT) => `${mmToUnitText(mm, unit)} ${DISPLAY_UNITS[unit].label}`;

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection, unit = DEFAULT_UNIT) {
  if (!selection) return '';
  const len = (mm) => length(mm, unit);
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return `Wardrobe · ${len(width)} × ${len(height)} × ${len(depth)}`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return `Compartment ${ci + 1} · width ${len(compartment.width)}`;
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return `Shelf · ${len(shelf.y)} from base · ${len(shelf.thickness)} thick`;
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return `Drawer · ${len(drawer.y)} from base · ${len(drawer.height)} high`;
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return `Hanging rail · ${len(rail.y)} from base`;
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return `Partition ${pi + 1} · ${len(design.partitions[pi].thickness)} thick`;
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return `${design.doors.type === 'sliding' ? 'Sliding' : 'Hinged'} door${door.hingeSide ? ` · hinge ${door.hingeSide}` : ''}`;
  return kind;
}
