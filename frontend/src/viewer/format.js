// Display formatting. The domain is integer mm; the UI shows centimetres (1 decimal).
export const cm = (mm) => (mm / 10).toFixed(1);

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return `Wardrobe · ${cm(width)} × ${cm(height)} × ${cm(depth)} cm`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return `Compartment ${ci + 1} · width ${cm(compartment.width)} cm`;
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return `Shelf · ${cm(shelf.y)} cm from base · ${cm(shelf.thickness)} cm thick`;
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return `Drawer · ${cm(drawer.y)} cm from base · ${cm(drawer.height)} cm high`;
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return `Hanging rail · ${cm(rail.y)} cm from base`;
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return `Partition ${pi + 1} · ${cm(design.partitions[pi].thickness)} cm thick`;
  for (const [di, door] of design.doors.items.entries()) {
    const shelf = door.shelves.find((s) => s.id === id);
    if (shelf) return `Door ${di + 1} shelf · ${cm(shelf.y)} cm from base · ${cm(shelf.depth)} cm deep`;
  }
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return `${design.doors.type === 'sliding' ? 'Sliding' : 'Hinged'} door${door.hingeSide ? ` · hinge ${door.hingeSide}` : ''}`;
  return kind;
}
