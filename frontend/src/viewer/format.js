// Display formatting. The domain is integer mm; the UI shows the selected unit (mm, cm or in).
import { formatLength, lengthLabel, units } from '../ui/units.js';
import { t, tf } from '../i18n/strings.js';

export const cm = (mm) => formatLength(mm, units.get());
const len = (mm) => lengthLabel(mm, units.get());

/** One-line description of a selected component, for labels and readouts (in the selected language and unit). */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return `${t('selWardrobe')} · ${cm(width)} × ${cm(height)} × ${cm(depth)} ${units.get()}`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return tf('selCompartment', { n: ci + 1, w: len(compartment.width) });
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return tf('selShelf', { y: len(shelf.y), t: len(shelf.thickness) });
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return tf('selDrawer', { y: len(drawer.y), h: len(drawer.height) });
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return tf('selRail', { y: len(rail.y) });
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return tf('selPartition', { n: pi + 1, t: len(design.partitions[pi].thickness) });
  const door = design.doors.items.find((d) => d.id === id);
  if (door) {
    const side = door.hingeSide ? ` · ${tf('selHinge', { side: t(door.hingeSide === 'left' ? 'edLeft' : 'edRight').toLowerCase() })}` : '';
    return `${t(design.doors.type === 'sliding' ? 'selSlidingDoor' : 'selHingedDoor')}${side}`;
  }
  return kind;
}
