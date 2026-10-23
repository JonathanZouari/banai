// Zoned variants of the basic wardrobe for the viewer tests. The zone fields (shelf.fixed,
// door.bottomShelfId / topShelfId, docs/schema.md "Zones") are set by hand, not through ops.
//   cmp_left: dividers shf_l2 (y 800) and shf_l4 (y 1600) make 3 zones, each with its own door
//   cmp_middle: unchanged, one full-height door without zone fields
//   cmp_right: dividers shf_r1 (y 800) and shf_r2 (y 1400): zone 1 a door over the drawers, zone 2
//   open (with drawer drw_r3 at 900..1100), zone 3 a split pair
import { loadDesign } from '../domain/helpers.js';

const basic = loadDesign('basic');

export const zoneDoor = (id, compartmentId, hingeSide, bottomShelfId, topShelfId) => ({
  id, compartmentIds: [compartmentId], hingeSide, appearance: null, handle: null, mirror: false, bottomShelfId, topShelfId,
});

export function zoned(leftDoors) {
  const design = structuredClone(basic);
  const [left, , right] = design.compartments;
  left.shelves.forEach((shelf) => { shelf.fixed = shelf.id === 'shf_l2' || shelf.id === 'shf_l4'; });
  right.shelves.forEach((shelf) => { shelf.fixed = true; });
  right.drawers.push({ id: 'drw_r3', y: 900, height: 200, appearance: null, handle: null });
  design.doors.items = [
    ...leftDoors,
    structuredClone(basic.doors.items[1]), // dr_middle
    zoneDoor('dr_r_z1', 'cmp_right', 'left', null, 'shf_r1'),
    zoneDoor('dr_r_z3', 'cmp_right', 'left', 'shf_r2', null),
    zoneDoor('dr_r_z3r', 'cmp_right', 'right', 'shf_r2', null),
  ];
  return design;
}

export const threeZones = zoned([
  zoneDoor('dr_l_z1', 'cmp_left', 'left', null, 'shf_l2'),
  zoneDoor('dr_l_z2', 'cmp_left', 'left', 'shf_l2', 'shf_l4'),
  zoneDoor('dr_l_z3', 'cmp_left', 'right', 'shf_l4', null),
]);

export const zonePair = zoned([
  zoneDoor('dr_l_z1', 'cmp_left', 'left', null, 'shf_l2'),
  zoneDoor('dr_l_z2', 'cmp_left', 'left', 'shf_l2', 'shf_l4'),
  zoneDoor('dr_l_z2r', 'cmp_left', 'right', 'shf_l2', 'shf_l4'),
  zoneDoor('dr_l_z3', 'cmp_left', 'right', 'shf_l4', null),
]);
