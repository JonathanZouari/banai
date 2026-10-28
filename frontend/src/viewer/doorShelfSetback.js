// How far (mm) the shelves and drawers of each compartment sit back from the front, to clear
// the deepest door shelf on the hinged door covering it. Visual only, never stored. No three.js
// here, so the editor can show the same number.
import { VISUAL } from './units.js';

export function doorShelfSetbacks(design) {
  const setback = new Map();
  if (design.doors.type === 'hinged') {
    for (const door of design.doors.items) {
      const deepest = Math.max(0, ...door.shelves.map((s) => s.depth));
      if (deepest > 0) door.compartmentIds.forEach((id) => setback.set(id, deepest + VISUAL.doorGap));
    }
  }
  return design.compartments.map((c) => setback.get(c.id) ?? 0);
}
