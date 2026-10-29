// Room fit: compare the wardrobe with the wall the customer measured. Pure, so it is unit-tested.
// It invents no rules: the only check is wardrobe <= free space per dimension. Clearances, filler
// panels, beams and door-opening space are left to the carpenter, and a photo is never proof of fit.

export const FIT_FIELDS = Object.freeze(['width', 'height', 'depth']);

/**
 * { status, lines }. status: 'fits' | 'tooBig' | 'incomplete' (some measurements missing) | 'empty'
 * (none entered). lines: one per dimension, { field, status: 'ok' | 'over' | 'missing', wardrobe,
 * room, over } in millimetres.
 */
export function checkFit(design, room) {
  const lines = FIT_FIELDS.map((field) => {
    const wardrobe = design.dimensions[field];
    const space = room?.[field];
    if (!Number.isInteger(space)) return { field, status: 'missing', wardrobe, room: null, over: 0 };
    const over = Math.max(0, wardrobe - space);
    return { field, status: over > 0 ? 'over' : 'ok', wardrobe, room: space, over };
  });
  const has = (status) => lines.some((line) => line.status === status);
  let status = 'fits';
  if (has('over')) status = 'tooBig';
  else if (lines.every((line) => line.status === 'missing')) status = 'empty';
  else if (has('missing')) status = 'incomplete';
  return { status, lines };
}
