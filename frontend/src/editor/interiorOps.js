// Pure mapping from the interior, site and history controls to domain ops (schema v2).
// No DOM, so every rule is unit-tested. The engine stays the single authority on validity:
// callers try the candidates in order and keep the first batch the engine accepts.

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
 * Set or clear one site measurement. `set_site` merges, so clearing one field clears the site
 * and puts the other one back.
 */
export function siteOps(site, field, mm) {
  if (mm !== null) return [{ op: 'set_site', [field]: mm }];
  const other = field === 'ceiling' ? 'niche' : 'ceiling';
  const keep = site?.[other] ?? null;
  return [{ op: 'set_site', clear: true }, ...(keep !== null ? [{ op: 'set_site', [other]: keep }] : [])];
}

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
