// Pure mapping from the interior, zone, site and history controls to domain ops (schema v2).
// No DOM, so every rule is unit-tested. The engine stays the single authority on validity:
// callers try the candidates in order and keep the first batch the engine accepts.
import { MAX_OBSTACLES } from '../domain/defaults.js';
import { dividers, zoneUsable } from '../domain/opsInterior.js';

export const PRESET_OPTIONS = Object.freeze([
  { value: 'long', label: 'תלייה ארוכה' },
  { value: 'double', label: 'תלייה כפולה' },
  { value: 'shelves', label: 'מדפים' },
  { value: 'drawers', label: 'מגירות ומדפים' },
]);

export const INSERT_OPTIONS = Object.freeze([
  { value: 'pulldown', label: 'מתקן תלייה נשלף' },
  { value: 'shoes', label: 'מדפי נעליים' },
  { value: 'trousers', label: 'מתקן מכנסיים' },
  { value: 'led', label: 'תאורת LED' },
]);
export const insertLabel = (type) => INSERT_OPTIONS.find((option) => option.value === type)?.label ?? type;

export const presetOps = (compartmentId, preset) => [{ op: 'apply_preset', compartmentId, preset }];

const ZONE_TYPES = new Set(['shoes', 'trousers']);

/**
 * Op batches that add an insert of `type`, best first. Zone inserts (shoes, trousers) try the
 * floor of the compartment, then the top of each shelf and drawer, bottom-up, so the first free
 * spot wins; the others take the engine defaults.
 */
export function addInsertCandidates(compartment, type) {
  if (!ZONE_TYPES.has(type)) return [[{ op: 'add_insert', compartmentId: compartment.id, type }]];
  const tops = [
    0,
    ...compartment.shelves.map((shelf) => shelf.y + shelf.thickness),
    ...compartment.drawers.map((drawer) => drawer.y + drawer.height),
  ];
  return [...new Set(tops)].sort((a, b) => a - b)
    .map((y) => [{ op: 'add_insert', compartmentId: compartment.id, type, y }]);
}

/** Dispatch candidate batches in order; returns the first ok result, or the first failure. */
export function runFirst(run, candidates) {
  let first = null;
  for (const ops of candidates) {
    const result = run(ops);
    if (result.ok) return result;
    first ??= result;
  }
  return first ?? { ok: false, error: { code: 'INVALID_OP' } };
}

/** The hinged doors that cover only this compartment, in item order (one leaf, or a split pair). */
export function compartmentLeaves(design, compartmentId) {
  if (design.doors.type !== 'hinged') return [];
  return design.doors.items.filter((door) => door.compartmentIds.length === 1 && door.compartmentIds[0] === compartmentId);
}

/** Split this compartment's door in two, or join the pair back; null when it does not apply. */
export function splitOps(design, compartmentId, on) {
  const leaves = compartmentLeaves(design, compartmentId);
  if (on) return leaves.length === 1 ? [{ op: 'split_door', id: leaves[0].id }] : null;
  return leaves.length === 2 ? [{ op: 'remove_component', id: leaves[1].id }] : null;
}

/**
 * Set or clear one site field (ceiling, niche or clearance). `set_site` merges, and `unset` clears one
 * field without touching the others. Null when there is nothing to clear.
 */
export function siteOps(site, field, mm) {
  if (mm !== null) return [{ op: 'set_site', [field]: mm }];
  return (site?.[field] ?? null) !== null ? [{ op: 'set_site', unset: [field] }] : null;
}

/**
 * Set or clear one of the three readings: heights (left, middle, right) or widths (top, middle, bottom).
 * The engine makes the smallest known reading the ceiling or the niche; with no reading left, it is
 * unset. A single legacy value (no readings) is replaced by the first reading. Null when nothing changes.
 */
export function siteReadingOps(site, kind, index, mm) {
  const next = (site?.[kind] ?? [null, null, null]).map((value, i) => (i === index ? mm : value));
  if (next.some((value) => value !== null)) return [{ op: 'set_site', [kind]: next }];
  const single = kind === 'widths' ? 'niche' : 'ceiling';
  return (site?.[single] ?? null) !== null ? [{ op: 'set_site', unset: [single] }] : null;
}

// ---- wall obstacles (docs/schema.md "Site") ----
export const MAX_PANEL_OBSTACLES = MAX_OBSTACLES;
export const OBSTACLE_OPTIONS = Object.freeze([
  { value: 'socket', label: 'שקע' },
  { value: 'switch', label: 'מתג' },
  { value: 'ac', label: 'מזגן' },
  { value: 'pipe', label: 'צנרת' },
  { value: 'window', label: 'חלון' },
  { value: 'panel', label: 'פנל' },
]);

/** A new obstacle: an 8 x 8 cm socket 30 cm up, in the middle of the wardrobe. */
export const newObstacle = (design) => ({ type: 'socket', x: Math.round(design.dimensions.width / 2) - 40, y: 300, width: 80, height: 80 });

/** Add one obstacle (null at the limit). `set_site` replaces the whole list. */
export function addObstacleOps(site, item) {
  const list = site?.obstacles ?? [];
  return list.length >= MAX_PANEL_OBSTACLES ? null : [{ op: 'set_site', obstacles: [...list, item] }];
}

/** Change fields of obstacle `index`; null when it no longer exists. */
export function updateObstacleOps(site, index, change) {
  const list = site?.obstacles ?? [];
  if (!list[index]) return null;
  return [{ op: 'set_site', obstacles: list.map((item, i) => (i === index ? { ...item, ...change } : item)) }];
}

/** Remove obstacle `index`; the last one leaves an empty list, which clears it. */
export function removeObstacleOps(site, index) {
  const list = site?.obstacles ?? [];
  if (!list[index]) return null;
  return [{ op: 'set_site', obstacles: list.filter((_, i) => i !== index) }];
}

// ---- zones (docs/schema.md "Zones") ----
export const MAX_ZONES = 4;

/**
 * A compartment's zones, bottom-up: { zone, low, high, anchors: [bottomShelfId, topShelfId], leaves }.
 * `low`/`high` are the usable interior y range; `leaves` counts its own doors with the zone's anchors.
 */
export function zonesOf(design, compartment) {
  const fixed = dividers(compartment);
  const own = design.doors.type === 'hinged'
    ? design.doors.items.filter((d) => d.compartmentIds.length === 1 && d.compartmentIds[0] === compartment.id)
    : [];
  return Array.from({ length: fixed.length + 1 }, (_, i) => {
    const zone = i + 1;
    const anchors = [zone >= 2 ? fixed[zone - 2].id : null, zone <= fixed.length ? fixed[zone - 1].id : null];
    const [low, high] = zoneUsable(design, compartment, zone);
    const leaves = own.filter((d) => (d.bottomShelfId ?? null) === anchors[0] && (d.topShelfId ?? null) === anchors[1]).length;
    return { zone, low, high, anchors, leaves };
  });
}

/** True when a door also covers other compartments: zones need the column's own doors. */
export const spannedBy = (design, compartmentId) =>
  design.doors.items.some((d) => d.compartmentIds.length > 1 && d.compartmentIds.includes(compartmentId));

export const zonesOps = (compartmentId, count) => [{ op: 'set_zones', compartmentId, count }];
export const zoneDoorOps = (compartmentId, zone, leaves) => [{ op: 'set_zone_door', compartmentId, zone, leaves }];
export const zonePresetOps = (compartmentId, zone, preset) => [{ op: 'apply_preset', compartmentId, preset, zone }];

// Edits that move one value continuously (a slider drag, retyping a field). Repeats of the same
// op on the same target and fields share one undo step; adding or removing parts never merges.
const CONTINUOUS = new Set([
  'update_dimensions', 'modify_compartment', 'modify_partition', 'modify_shelf', 'modify_drawer',
  'modify_rail', 'modify_insert', 'set_site',
]);
const TARGET_KEYS = ['id', 'compartmentId', 'partitionId'];

/** The undo-coalescing key of a batch, or null when it must be its own step. */
export function coalesceKey(ops) {
  if (!Array.isArray(ops) || ops.length !== 1 || !CONTINUOUS.has(ops[0]?.op)) return null;
  const { op, ...rest } = ops[0];
  const target = TARGET_KEYS.map((key) => rest[key]).find((value) => value !== undefined) ?? '';
  const fields = Object.keys(rest).filter((key) => !TARGET_KEYS.includes(key)).sort().join(',');
  return `${op}:${target}:${fields}`;
}
