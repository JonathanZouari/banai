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

// Starting templates (prototype placeholders, not business data). Each is a list of ops like
// BASIC_WARDROBE_OPS; mirrored in backend/app/domain/defaults.py and checked against
// shared/fixtures/designs/template_*.json on both sides.
export const KIDS_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1500, height: 1800, depth: 500, compartmentCount: 2,
    compartmentIds: ['cmp_k_left', 'cmp_k_right'], partitionIds: ['prt_k1'] },
  { op: 'add_rail', compartmentId: 'cmp_k_left', y: 1350, id: 'rail_k1' },
  { op: 'add_shelf', compartmentId: 'cmp_k_left', y: 1500, id: 'shf_k_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_k_right', y: 600, id: 'shf_k_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_k_right', y: 1000, id: 'shf_k_r2' },
  { op: 'add_shelf', compartmentId: 'cmp_k_right', y: 1400, id: 'shf_k_r3' },
  { op: 'add_drawer', compartmentId: 'cmp_k_right', y: 0, height: 200, id: 'drw_k_r1' },
  { op: 'add_drawer', compartmentId: 'cmp_k_right', y: 200, height: 200, id: 'drw_k_r2' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_k_left', 'dr_k_right'] },
]);

export const DOUBLE_SLIDING_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 2400, height: 2400, depth: 600, compartmentCount: 3,
    compartmentIds: ['cmp_d_left', 'cmp_d_middle', 'cmp_d_right'], partitionIds: ['prt_d1', 'prt_d2'] },
  { op: 'add_rail', compartmentId: 'cmp_d_left', y: 1900, id: 'rail_d_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_d_left', y: 2000, id: 'shf_d_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_d_middle', y: 600, id: 'shf_d_m1' },
  { op: 'add_shelf', compartmentId: 'cmp_d_middle', y: 1000, id: 'shf_d_m2' },
  { op: 'add_shelf', compartmentId: 'cmp_d_middle', y: 1400, id: 'shf_d_m3' },
  { op: 'add_shelf', compartmentId: 'cmp_d_middle', y: 1800, id: 'shf_d_m4' },
  { op: 'add_drawer', compartmentId: 'cmp_d_middle', y: 0, height: 200, id: 'drw_d_m1' },
  { op: 'add_drawer', compartmentId: 'cmp_d_middle', y: 200, height: 200, id: 'drw_d_m2' },
  { op: 'add_rail', compartmentId: 'cmp_d_right', y: 1900, id: 'rail_d_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_d_right', y: 2000, id: 'shf_d_r1' },
  { op: 'configure_doors', type: 'sliding', count: 3, ids: ['dr_d_1', 'dr_d_2', 'dr_d_3'] },
]);

export const MINIMALIST_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1800, height: 2400, depth: 500, compartmentCount: 2,
    compartmentIds: ['cmp_m_left', 'cmp_m_right'], partitionIds: ['prt_m1'] },
  { op: 'add_rail', compartmentId: 'cmp_m_left', y: 2200, id: 'rail_m_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_m_right', y: 600, id: 'shf_m_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_m_right', y: 1200, id: 'shf_m_r2' },
  { op: 'add_shelf', compartmentId: 'cmp_m_right', y: 1800, id: 'shf_m_r3' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_m_left', 'dr_m_right'] },
]);

/** The starting templates offered on the start screen. `basic` is first and keeps its own entry card. */
export const TEMPLATES = Object.freeze([
  Object.freeze({ id: 'basic', name: 'Basic wardrobe', description: '200 × 240 × 60 cm, three compartments, hinged doors.', ops: BASIC_WARDROBE_OPS }),
  Object.freeze({ id: 'kids', name: "Kids' wardrobe 150 cm", description: '150 × 180 × 50 cm: a low hanging rail on one side, shelves and two drawers on the other.', ops: KIDS_WARDROBE_OPS }),
  Object.freeze({ id: 'double-sliding', name: 'Double wardrobe with sliding doors', description: '240 × 240 × 60 cm: two hanging sections and a shelves-and-drawers section behind three sliding doors.', ops: DOUBLE_SLIDING_WARDROBE_OPS }),
  Object.freeze({ id: 'minimalist', name: 'Minimalist wardrobe', description: '180 × 240 × 50 cm: one hanging rail, three shelves, two hinged doors.', ops: MINIMALIST_WARDROBE_OPS }),
]);

/** Build the design of a template through the op protocol. Throws for an unknown id. */
export function buildTemplate(id, catalog) {
  const template = TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new RangeError(`unknown template: ${id}`);
  return applyOps(null, template.ops, catalog);
}
