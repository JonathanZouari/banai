// Plain-Hebrew differences between two canonical designs, "before ← after" in reading order
// (RTL: the arrow points from the old value to the new). Used by hold-to-compare, and later by
// AI proposals, so a change is always described the same way. Pure: no DOM, no store.
import { insertLabel } from '../editor/interiorOps.js';

const DOORS = Object.freeze({ hinged: 'ציר', sliding: 'הזזה', none: 'ללא' });
const cm = (mm) => {
  const value = Math.round(mm) / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};
const counted = (n, one, many) => (n === 1 ? `${one} אחד` : `${n} ${many}`);

function leaves(design, compartmentId) {
  return design.doors.type === 'hinged'
    ? design.doors.items.filter((d) => d.compartmentIds.length === 1 && d.compartmentIds[0] === compartmentId).length
    : 0;
}

function compartmentChanges(a, b, i, out) {
  const after = b.compartments[i];
  const before = a.compartments.find((c) => c.id === after.id); // ids are stable; positions shift
  const n = i + 1;
  if (!before) {
    out.push(`תא ${n} חדש, ${cm(after.width)} ס״מ`);
    return;
  }
  if (before.width !== after.width) out.push(`תא ${n}: רוחב ${cm(before.width)} ← ${cm(after.width)} ס״מ`);
  for (const [key, one, many] of [['shelves', 'מדף', 'מדפים'], ['drawers', 'מגירה', 'מגירות'], ['rails', 'מוט', 'מוטות']]) {
    if (before[key].length !== after[key].length) {
      out.push(`תא ${n}: ${counted(before[key].length, one, many)} ← ${counted(after[key].length, one, many)}`);
    }
  }
  const types = (c) => new Set(c.inserts.map((x) => x.type));
  const was = types(before);
  const now = types(after);
  for (const type of now) if (!was.has(type)) out.push(`תא ${n}: + ${insertLabel(type)}`);
  for (const type of was) if (!now.has(type)) out.push(`תא ${n}: − ${insertLabel(type)}`);
  const [leavesA, leavesB] = [leaves(a, before.id), leaves(b, after.id)];
  if (leavesA && leavesB && leavesA !== leavesB) out.push(`תא ${n}: ${leavesB === 2 ? 'שתי דלתות' : 'דלת אחת'}`);
}

/** Changes from `a` (before) to `b` (after), as short lines; [] when nothing differs. */
export function diffDesigns(a, b) {
  const out = [];
  const dim = (label, x, y) => {
    if (x === y) return;
    out.push(`${label}: ${x == null ? 'לא ידוע' : `${cm(x)} ס״מ`} ← ${y == null ? 'לא ידוע' : `${cm(y)} ס״מ`}`);
  };
  dim('רוחב', a.dimensions.width, b.dimensions.width);
  dim('גובה', a.dimensions.height, b.dimensions.height);
  dim('עומק', a.dimensions.depth, b.dimensions.depth);
  dim('צוקל', a.carcass.plinthHeight, b.carcass.plinthHeight);
  dim('תקרה', a.site?.ceiling ?? null, b.site?.ceiling ?? null);
  dim('נישה', a.site?.niche ?? null, b.site?.niche ?? null);
  dim('מרחב מול הארון', a.site?.clearance ?? null, b.site?.clearance ?? null);
  // set_site replaces the whole obstacle list: a proposal that drops one must say so on its card.
  const obstacles = (d) => d.site?.obstacles ?? [];
  if (obstacles(a).length !== obstacles(b).length) out.push(`מכשולים בקיר: ${obstacles(a).length} ← ${obstacles(b).length}`);
  else if (JSON.stringify(obstacles(a)) !== JSON.stringify(obstacles(b))) out.push('מכשולים בקיר: עודכנו');
  if (a.carcass.panelThickness !== b.carcass.panelThickness) {
    out.push(`לוח: ${a.carcass.panelThickness} ← ${b.carcass.panelThickness} מ״מ`);
  }
  if (a.doors.type !== b.doors.type) out.push(`דלתות: ${DOORS[a.doors.type]} ← ${DOORS[b.doors.type]}`);
  else if (a.doors.type === 'sliding' && a.doors.items.length !== b.doors.items.length) {
    out.push(`כנפי הזזה: ${a.doors.items.length} ← ${b.doors.items.length}`);
  }
  const mirrors = (d) => d.doors.items.filter((door) => door.mirror).length;
  if (mirrors(a) !== mirrors(b)) out.push(`דלתות מראה: ${mirrors(a)} ← ${mirrors(b)}`);
  if (a.compartments.length !== b.compartments.length) out.push(`תאים: ${a.compartments.length} ← ${b.compartments.length}`);
  b.compartments.forEach((_, i) => compartmentChanges(a, b, i, out));
  return out;
}
