// Display formatting (Hebrew UI). The domain is integer mm; the UI shows centimetres (1 decimal).
import { SHOE_TIER } from '../domain/defaults.js';

export const cm = (mm) => (mm / 10).toFixed(1);
const CM = 'ס״מ';
const fromBase = (mm) => `${cm(mm)} ${CM} מהבסיס`;

const HINGE = Object.freeze({ left: 'ציר שמאלי', right: 'ציר ימני' });
const INSERT_NAMES = Object.freeze({ pulldown: 'מתקן תלייה נשלף', shoes: 'מדפי נעליים', trousers: 'מתקן מכנסיים', led: 'תאורת LED' });

/** One-line description of an interior insert. */
export function describeInsert(insert) {
  const name = INSERT_NAMES[insert.type] ?? insert.type;
  if (insert.type === 'shoes') return `${name} · ${insert.tiers === 1 ? 'קומה אחת' : `${insert.tiers} קומות`} · גובה ${cm(insert.tiers * SHOE_TIER)} ${CM} · ${fromBase(insert.y)}`;
  if (insert.type === 'trousers') return `${name} · גובה ${cm(insert.height)} ${CM} · ${fromBase(insert.y)}`;
  if (insert.type === 'pulldown') return `${name} · ${fromBase(insert.y)}`;
  return name;
}

/** One-line description of a selected component, for labels and readouts. */
export function describeSelection(design, selection) {
  if (!selection) return '';
  const { id, kind } = selection;
  const { width, height, depth } = design.dimensions;
  if (kind === 'carcass') return `ארון · ${cm(width)} × ${cm(height)} × ${cm(depth)} ${CM}`;
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === id) return `תא ${ci + 1} · רוחב ${cm(compartment.width)} ${CM}`;
    const shelf = compartment.shelves.find((s) => s.id === id);
    if (shelf) return `מדף · ${fromBase(shelf.y)} · עובי ${cm(shelf.thickness)} ${CM}`;
    const drawer = compartment.drawers.find((d) => d.id === id);
    if (drawer) return `מגירה · ${fromBase(drawer.y)} · גובה ${cm(drawer.height)} ${CM}`;
    const rail = compartment.rails.find((r) => r.id === id);
    if (rail) return `מוט תלייה · ${fromBase(rail.y)}`;
    const insert = (compartment.inserts ?? []).find((i) => i.id === id);
    if (insert) return describeInsert(insert);
  }
  const pi = design.partitions.findIndex((p) => p.id === id);
  if (pi >= 0) return `מחיצה ${pi + 1} · עובי ${cm(design.partitions[pi].thickness)} ${CM}`;
  const door = design.doors.items.find((d) => d.id === id);
  if (door) return design.doors.type === 'sliding' ? 'דלת הזזה' : `דלת ציר${HINGE[door.hingeSide] ? ` · ${HINGE[door.hingeSide]}` : ''}`;
  return kind;
}
