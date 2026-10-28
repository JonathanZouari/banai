// Predefined starting designs. Mirrors the *_OPS lists / PRESETS in
// backend/app/domain/defaults.py (configurable prototype values, not business rules).

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

// Child-height rail and reachable shelves.
export const KIDS_WARDROBE_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1500, height: 2000, depth: 550, compartmentCount: 2,
    compartmentIds: ['cmp_hang', 'cmp_store'], partitionIds: ['prt_1'] },
  { op: 'add_rail', compartmentId: 'cmp_hang', y: 1200, id: 'rail_h1' },
  { op: 'add_shelf', compartmentId: 'cmp_hang', y: 1300, id: 'shf_h1' },
  { op: 'add_shelf', compartmentId: 'cmp_hang', y: 1650, id: 'shf_h2' },
  { op: 'add_drawer', compartmentId: 'cmp_store', y: 0, height: 200, id: 'drw_s1' },
  { op: 'add_drawer', compartmentId: 'cmp_store', y: 200, height: 200, id: 'drw_s2' },
  { op: 'add_shelf', compartmentId: 'cmp_store', y: 700, id: 'shf_s1' },
  { op: 'add_shelf', compartmentId: 'cmp_store', y: 1000, id: 'shf_s2' },
  { op: 'add_shelf', compartmentId: 'cmp_store', y: 1300, id: 'shf_s3' },
  { op: 'add_shelf', compartmentId: 'cmp_store', y: 1650, id: 'shf_s4' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_hang', 'dr_store'] },
  { op: 'set_material', target: 'doors', color: { catalogId: 'natural_oak' } },
]);

// Two hanging sections around a central drawer and shelf stack.
export const DOUBLE_SLIDING_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 2400, height: 2400, depth: 650, compartmentCount: 3,
    compartmentIds: ['cmp_left', 'cmp_middle', 'cmp_right'], partitionIds: ['prt_1', 'prt_2'] },
  { op: 'add_rail', compartmentId: 'cmp_left', y: 1900, id: 'rail_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 2000, id: 'shf_l1' },
  { op: 'add_drawer', compartmentId: 'cmp_middle', y: 0, height: 200, id: 'drw_m1' },
  { op: 'add_drawer', compartmentId: 'cmp_middle', y: 200, height: 200, id: 'drw_m2' },
  { op: 'add_drawer', compartmentId: 'cmp_middle', y: 400, height: 200, id: 'drw_m3' },
  { op: 'add_shelf', compartmentId: 'cmp_middle', y: 1000, id: 'shf_m1' },
  { op: 'add_shelf', compartmentId: 'cmp_middle', y: 1400, id: 'shf_m2' },
  { op: 'add_shelf', compartmentId: 'cmp_middle', y: 1800, id: 'shf_m3' },
  { op: 'add_rail', compartmentId: 'cmp_right', y: 1900, id: 'rail_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 2000, id: 'shf_r1' },
  { op: 'configure_doors', type: 'sliding', ids: ['dr_a', 'dr_b'] },
  { op: 'set_material', target: 'doors', color: { catalogId: 'light_grey' }, finish: { catalogId: 'satin' } },
]);

export const MINIMALIST_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1800, height: 2400, depth: 600, compartmentCount: 2,
    compartmentIds: ['cmp_left', 'cmp_right'], partitionIds: ['prt_1'] },
  { op: 'add_rail', compartmentId: 'cmp_left', y: 1900, id: 'rail_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_left', y: 2000, id: 'shf_l1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 600, id: 'shf_r1' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 1200, id: 'shf_r2' },
  { op: 'add_shelf', compartmentId: 'cmp_right', y: 1800, id: 'shf_r3' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_left', 'dr_right'] },
  { op: 'set_material', target: 'carcass', material: { catalogId: 'lacquered_mdf' }, color: { catalogId: 'anthracite' } },
  { op: 'set_material', target: 'doors', material: { catalogId: 'lacquered_mdf' }, color: { catalogId: 'anthracite' } },
]);

// Shallow: coats on one side, shoe shelves on the other.
export const HALLWAY_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1200, height: 2200, depth: 400, compartmentCount: 2,
    compartmentIds: ['cmp_coats', 'cmp_shoes'], partitionIds: ['prt_1'] },
  { op: 'add_rail', compartmentId: 'cmp_coats', y: 1700, id: 'rail_c1' },
  { op: 'add_shelf', compartmentId: 'cmp_coats', y: 1800, id: 'shf_c1' },
  { op: 'add_shelf', compartmentId: 'cmp_shoes', y: 250, id: 'shf_s1' },
  { op: 'add_shelf', compartmentId: 'cmp_shoes', y: 500, id: 'shf_s2' },
  { op: 'add_shelf', compartmentId: 'cmp_shoes', y: 750, id: 'shf_s3' },
  { op: 'add_shelf', compartmentId: 'cmp_shoes', y: 1000, id: 'shf_s4' },
  { op: 'add_shelf', compartmentId: 'cmp_shoes', y: 1400, id: 'shf_s5' },
  { op: 'add_shelf', compartmentId: 'cmp_shoes', y: 1800, id: 'shf_s6' },
  { op: 'configure_doors', type: 'hinged', ids: ['dr_coats', 'dr_shoes'] },
]);

export const OPEN_SHELVING_OPS = deepFreeze([
  { op: 'create_wardrobe', width: 1600, height: 2000, depth: 400, compartmentCount: 3,
    compartmentIds: ['cmp_left', 'cmp_middle', 'cmp_right'], partitionIds: ['prt_1', 'prt_2'] },
  ...['l', 'm', 'r'].flatMap((side, i) => [400, 800, 1200, 1600].map((y, k) => ({
    op: 'add_shelf', compartmentId: ['cmp_left', 'cmp_middle', 'cmp_right'][i], y, id: `shf_${side}${k + 1}`,
  }))),
  { op: 'configure_doors', type: 'none' },
  { op: 'set_material', target: 'carcass', material: { catalogId: 'oak_veneer' }, color: { catalogId: 'natural_oak' } },
]);

/**
 * The starting templates offered on the start screen, in display order. `title` per UI language, `size`
 * in cm (W × H × D). `backdrop` is a decorative room for the viewer only (viewer/backdrop.js), never
 * part of the design.
 */
export const PRESETS = deepFreeze([
  { id: 'basic', title: { he: 'ארון בסיסי', en: 'Basic wardrobe' }, size: '200 × 240 × 60', ops: BASIC_WARDROBE_OPS, backdrop: 'bedroom' },
  { id: 'kids', title: { he: 'ארון ילדים', en: "Kids' wardrobe" }, size: '150 × 200 × 55', ops: KIDS_WARDROBE_OPS, backdrop: 'kids_room' },
  { id: 'double_sliding', title: { he: 'ארון זוגי עם דלתות הזזה', en: 'Double wardrobe with sliding doors' }, size: '240 × 240 × 65', ops: DOUBLE_SLIDING_OPS, backdrop: 'master_bedroom' },
  { id: 'minimalist', title: { he: 'ארון מינימליסטי', en: 'Minimalist wardrobe' }, size: '180 × 240 × 60', ops: MINIMALIST_OPS, backdrop: 'minimal_room' },
  { id: 'hallway', title: { he: 'ארון כניסה', en: 'Hallway wardrobe' }, size: '120 × 220 × 40', ops: HALLWAY_OPS, backdrop: 'entrance' },
  { id: 'open_shelving', title: { he: 'ארון מדפים פתוח', en: 'Open shelving' }, size: '160 × 200 × 40', ops: OPEN_SHELVING_OPS, backdrop: 'study' },
]);

/** A template's label in the UI language (Hebrew by default), e.g. "ארון ילדים (150 × 200 × 55 ס"מ)". */
export const presetLabel = (preset, language) =>
  language === 'en' ? `${preset.title.en} (${preset.size} cm)` : `${preset.title.he} (${preset.size} ס"מ)`;

/** Build a template through the op protocol; null for an unknown id. */
export function buildPreset(id, catalog) {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ? applyOps(null, preset.ops, catalog) : null;
}

/** The predefined starting wardrobe (entry option 3), built through the op protocol. */
export const basicWardrobe = (catalog) => buildPreset('basic', catalog);
