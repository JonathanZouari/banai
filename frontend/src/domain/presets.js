// Predefined starting designs. Mirrors BASIC_WARDROBE_OPS / basic_wardrobe in
// backend/app/domain/defaults.py (configurable prototype values).

import { applyOps } from './apply.js';
import { deepFreeze } from './util.js';

export const BASIC_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 2000, height: 2400, depth: 600, compartmentCount: 3,
    compartmentIds: ['cmp_left', 'cmp_middle', 'cmp_right'], partitionIds: ['prt_1', 'prt_2'] },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 400, id: 'shf_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 800, id: 'shf_l2' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 1200, id: 'shf_l3' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 1600, id: 'shf_l4' },
  { op: 'add_shelf', compartmentId: 'cmp_middle', y: 2000, id: 'shf_m1' },
  { op: 'add_rail', compartmentId: 'cmp_middle', y: 1900, id: 'rail_m1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 800, id: 'shf_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 1400, id: 'shf_r2' },
  { op: 'add_drawer', compartmentId: 'cmp_right', y: 0, height: 200, id: 'drw_r1' },
  { op: 'add_drawer', compartmentId: 'cmp_right', y: 200, height: 200, id: 'drw_r2' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_left', 'dr_middle', 'dr_right'] },
]);

/** The predefined starting wardrobe (entry option 3), built through the op protocol. */
export const basicWardrobe = (catalog) => applyOps(null, BASIC_WARDROBE_OPS, catalog);

// Starting templates (configurable prototype layouts, not business data). Heights are y from the
// top of the bottom panel; the floor is 18 mm lower. Why each layout is comfortable to use is
// checked in tests/unit/domain/templates.test.js, as prototype assumptions, never shown as rules.

// 100 x 150 x 50 cm: every rail and shelf within a young child's reach (at most 120 cm from the floor).
export const KIDS_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1000, height: 1500, depth: 500, compartmentCount: 2,
    compartmentIds: ['cmp_kl', 'cmp_kr'], partitionIds: ['prt_k1'] },
  { op: 'add_drawer', compartmentId: 'cmp_kl', y: 0, height: 250, id: 'drw_k1' },
  { op: 'add_rail', compartmentId: 'cmp_kl', y: 1050, id: 'rail_k1' },
  { op: 'add_shelf', compartmentId: 'cmp_kl', y: 1150, id: 'shf_k1' },
  { op: 'add_shelf', compartmentId: 'cmp_kr', y: 350, id: 'shf_k2' },
  { op: 'add_shelf', compartmentId: 'cmp_kr', y: 700, id: 'shf_k3' },
  { op: 'add_shelf', compartmentId: 'cmp_kr', y: 1050, id: 'shf_k4' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_kl', 'dr_kr'] },
  { op: 'set_material', target: 'doors', color: { catalogId: 'sage_green' } },
]);

// 220 x 240 x 65 cm: long hanging on the left, double (short) hanging on the right, sliding doors.
export const DOUBLE_SLIDING_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 2200, height: 2400, depth: 650, compartmentCount: 2,
    compartmentIds: ['cmp_dl', 'cmp_dr'], partitionIds: ['prt_d1'] },
  { op: 'add_rail', compartmentId: 'cmp_dl', y: 1900, id: 'rail_dl' },
  { op: 'add_shelf', compartmentId: 'cmp_dl', y: 2000, id: 'shf_dl' },
  { op: 'add_rail', compartmentId: 'cmp_dr', y: 950, id: 'rail_dd' },
  { op: 'add_rail', compartmentId: 'cmp_dr', y: 1950, id: 'rail_du' },
  { op: 'add_shelf', compartmentId: 'cmp_dr', y: 2050, id: 'shf_dr' },
  { op: 'configure_doors', type: 'sliding', count: 2, ids: ['dr_s1', 'dr_s2'] },
  { op: 'set_material', target: 'doors', material: { catalogId: 'oak_veneer' }, color: { catalogId: 'natural_oak' } },
]);

// 120 x 220 x 60 cm: few parts, one long-hanging rail and three open-spaced shelves.
export const MINIMALIST_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1200, height: 2200, depth: 600, compartmentCount: 2,
    compartmentIds: ['cmp_ml', 'cmp_mr'], partitionIds: ['prt_m1'] },
  { op: 'add_rail', compartmentId: 'cmp_ml', y: 1700, id: 'rail_ml' },
  { op: 'add_shelf', compartmentId: 'cmp_ml', y: 1800, id: 'shf_ml' },
  { op: 'add_shelf', compartmentId: 'cmp_mr', y: 500, id: 'shf_m1' },
  { op: 'add_shelf', compartmentId: 'cmp_mr', y: 1000, id: 'shf_m2' },
  { op: 'add_shelf', compartmentId: 'cmp_mr', y: 1500, id: 'shf_m3' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_ml', 'dr_mr'] },
  { op: 'set_material', target: 'doors', color: { catalogId: 'light_grey' }, finish: { catalogId: 'satin' } },
]);

/** Template id -> its ops, in gallery order. Mirrors TEMPLATE_OPS in defaults.py. */
export const TEMPLATE_OPS = deepFreeze({
  basic: BASIC_WARDROBE_OPS,
  kids: KIDS_WARDROBE_OPS,
  double: DOUBLE_SLIDING_WARDROBE_OPS,
  minimal: MINIMALIST_WARDROBE_OPS,
});

/** Build a template through the op protocol (validated like any other design). */
export function buildTemplate(id, catalog) {
  if (!Object.hasOwn(TEMPLATE_OPS, id)) throw new Error(`Unknown template: ${id}`);
  return applyOps(null, TEMPLATE_OPS[id], catalog);
}
