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

/**
 * Zone number (1 from the bottom) of a door anchored to dividers, or null for a full-height door. The
 * dividers (fixed shelves) of its compartment, by height, bound the zones (docs/schema.md "Zones").
 */
export function doorZone(design, door) {
  const bottom = door.bottomShelfId ?? null;
  if (bottom === null && (door.topShelfId ?? null) === null) return null;
  if (bottom === null) return 1;
  const compartment = design.compartments.find((c) => c.id === door.compartmentIds[0]);
  const dividers = (compartment?.shelves ?? []).filter((s) => s.fixed === true).sort((a, b) => a.y - b.y);
  const index = dividers.findIndex((s) => s.id === bottom);
  return index < 0 ? null : index + 2;
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
    if (shelf) return `${shelf.fixed === true ? 'מדף קבוע' : 'מדף'} · ${fromBase(shelf.y)} · עובי ${cm(shelf.thickness)} ${CM}`;
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
  if (door && design.doors.type === 'sliding') return 'דלת הזזה';
  if (door) {
    const zone = doorZone(design, door);
    return `דלת ציר${HINGE[door.hingeSide] ? ` · ${HINGE[door.hingeSide]}` : ''}${zone ? ` · אזור ${zone}` : ''}`;
  }
  return kind;
}
