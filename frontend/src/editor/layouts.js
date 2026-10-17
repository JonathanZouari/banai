// Interior layouts ("formations"): replace every compartment's shelves, rails and drawers
// in one atomic op list. Pure, no DOM. Positions are fractions of the interior height, so a
// layout fits any wardrobe height; drawers keep a fixed height and stack from the base.
// ASSUMPTION: prototype starting points for the customer to adjust, not storage advice.
import { interiorHeight } from '../domain/geometry.js';
import { ITEM_KINDS } from '../domain/util.js';
import { NEW_ITEM } from './opsFromForm.js';

// Classic matches the basic wardrobe preset (domain/presets.js) at its default 2364 mm interior.
const CLASSIC_H = 2364;
const at = (mm) => mm / CLASSIC_H;

// A compartment "role": shelf and rail positions as fractions, plus a drawer count.
const ROLES = Object.freeze({
  shelves4: { shelves: [at(400), at(800), at(1200), at(1600)] },
  hanging: { shelves: [at(2000)], rails: [at(1900)] },
  drawers2: { drawers: 2, shelves: [at(800), at(1400)] },
  longHang: { shelves: [0.86], rails: [0.82] },
  shelves5: { shelves: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] },
  doubleHang: { shelves: [0.86, 0.47], rails: [0.82, 0.43] },
  drawers4: { drawers: 4, shelves: [0.5, 0.68, 0.86] },
  shelves6: { shelves: [1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7] },
});

/** The layouts offered in the editor. Roles repeat left to right across the compartments. */
export const INTERIOR_LAYOUTS = Object.freeze([
  { id: 'classic', label: 'Classic', description: 'Shelves, a hanging rail, and drawers with shelves.', roles: ['shelves4', 'hanging', 'drawers2'] },
  { id: 'hanging', label: 'Hanging focus', description: 'Long hanging, open shelves, and double hanging.', roles: ['longHang', 'shelves5', 'doubleHang'] },
  { id: 'storage', label: 'Shelves & drawers', description: 'Drawer towers either side of a tall shelf stack.', roles: ['drawers4', 'shelves6', 'drawers4'] },
]);

function itemsFor(role, top, compartmentId) {
  const thickness = NEW_ITEM.shelfThickness;
  const drawerHeight = NEW_ITEM.drawerHeight;
  // Never stack drawers above 40% of the interior; low wardrobes get fewer (or none).
  const drawers = Math.min(role.drawers ?? 0, Math.floor((top * 0.4) / drawerHeight));
  const drawerTop = drawers * drawerHeight;
  const ops = Array.from({ length: drawers }, (_, i) => ({ op: 'add_drawer', compartmentId, y: i * drawerHeight, height: drawerHeight }));
  // Shelves: inside the interior, clear of the drawer stack and at least 10 cm apart.
  const shelfYs = [];
  for (const fraction of role.shelves ?? []) {
    const y = Math.round(fraction * top);
    const clear = y >= drawerTop && y + thickness <= top && shelfYs.every((other) => Math.abs(other - y) >= 100);
    if (clear) shelfYs.push(y);
  }
  ops.push(...shelfYs.map((y) => ({ op: 'add_shelf', compartmentId, y, thickness })));
  // Rails hang below their shelf; one inside a shelf or drawer is dropped.
  for (const fraction of role.rails ?? []) {
    const y = Math.round(fraction * top);
    const blocked = y <= drawerTop || shelfYs.some((s) => s <= y && y <= s + thickness);
    if (!blocked && y < top) ops.push({ op: 'add_rail', compartmentId, y });
  }
  return ops;
}

/** Ops that empty every compartment and fill it according to the chosen layout. */
export function layoutOps(design, layoutId) {
  const layout = INTERIOR_LAYOUTS.find((candidate) => candidate.id === layoutId);
  if (!layout) return [];
  const top = interiorHeight(design);
  const removals = design.compartments.flatMap((compartment) =>
    ITEM_KINDS.flatMap((kind) => compartment[kind].map((item) => ({ op: 'remove_component', id: item.id }))));
  const additions = design.compartments.flatMap((compartment, index) =>
    itemsFor(ROLES[layout.roles[index % layout.roles.length]], top, compartment.id));
  return [...removals, ...additions];
}
