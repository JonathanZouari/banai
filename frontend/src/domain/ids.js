// Stable, typed component identifiers (`<prefix>_<suffix>`). Mirrors backend/app/domain/ids.py.

export const COMPARTMENT = 'cmp';
export const PARTITION = 'prt';
export const SHELF = 'shf';
export const DRAWER = 'drw';
export const RAIL = 'rail';
export const DOOR = 'dr';
export const DOOR_SHELF = 'dsh';

const SUFFIX = '[A-Za-z0-9_-]{1,40}';
export const ANY_ID_PATTERN = new RegExp(`^(cmp|prt|shf|drw|rail|dr|dsh)_${SUFFIX}$`);
export const TARGET_PATTERN = new RegExp(`^(carcass|doors|(cmp|prt|shf|drw|rail|dr|dsh)_${SUFFIX})$`);

export const idPattern = (prefix) => new RegExp(`^${prefix}_${SUFFIX}$`);

export function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}
