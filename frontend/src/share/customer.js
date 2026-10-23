// The customer's details (ADR-038): name, how to reach them, where the wardrobe is installed (floor, lift) and
// when. They are kept with the project in this browser, never in the design: no undo step, no signed proposal,
// and the agent never sees them. The dossier request carries them for that one PDF. Every field is optional.
// Mirrors backend/app/dossier/customer.py: the server checks them again. Pure: unit-tested.

export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,24}$/;
export const EMAIL_PATTERN = /^[^@\s]{1,64}@[^@\s.]{1,63}(\.[^@\s.]{1,63})+$/;
export const FLOOR_RANGE = Object.freeze([-5, 150]);
// Control, invisible and bidi characters, and tag characters: dropped as the customer types (as cleanName).
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]|[\u{E0000}-\u{E007F}]/gu;

// The text fields, in the dialog's order. `max` counts characters as Python does (code points).
export const TEXT_FIELDS = Object.freeze([
  { key: 'name', label: 'שם מלא', max: 60, autocomplete: 'name' },
  { key: 'phone', label: 'טלפון', max: 30, autocomplete: 'tel', inputMode: 'tel', dir: 'ltr', pattern: PHONE_PATTERN, hint: 'מספר טלפון, למשל 052-1234567' },
  { key: 'email', label: 'דוא״ל', max: 120, autocomplete: 'email', inputMode: 'email', dir: 'ltr', pattern: EMAIL_PATTERN, hint: 'כתובת דוא״ל, למשל name@example.com' },
  { key: 'address', label: 'כתובת להתקנה (רחוב ומספר)', max: 120, autocomplete: 'street-address' },
  { key: 'city', label: 'עיר', max: 60, autocomplete: 'address-level2' },
  { key: 'contactTimes', label: 'זמנים נוחים לשיחה', max: 60 },
  { key: 'notes', label: 'הערות לנגר', max: 500, multiline: true },
]);
export const CUSTOMER_KEYS = Object.freeze([...TEXT_FIELDS.map((f) => f.key), 'floor', 'elevator', 'installDate']);

export const YEARS = Object.freeze([1900, 2100]); // installation dates, as the server checks
const isDate = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const year = Number(text.slice(0, 4));
  if (year < YEARS[0] || year > YEARS[1]) return false;
  const day = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text;
};

/**
 * Check the customer's details as typed. Returns { ok: true, customer } (only the filled fields, cleaned; null
 * when nothing is filled) or { ok: false, field, message }.
 */
export function checkCustomer(raw = {}) {
  const customer = {};
  for (const { key, label, max, pattern, hint } of TEXT_FIELDS) {
    const text = String(raw[key] ?? '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if ([...text].length > max) return { ok: false, field: key, message: `${label}: עד ${max} תווים.` };
    if (pattern && !pattern.test(text)) return { ok: false, field: key, message: hint };
    customer[key] = text;
  }
  const floor = String(raw.floor ?? '').trim();
  if (floor) {
    const n = Number(floor);
    if (!Number.isInteger(n) || n < FLOOR_RANGE[0] || n > FLOOR_RANGE[1]) return { ok: false, field: 'floor', message: 'קומה: מספר שלם, למשל 3.' };
    customer.floor = n;
  }
  if (raw.elevator === true || raw.elevator === false) customer.elevator = raw.elevator;
  const day = String(raw.installDate ?? '').trim();
  if (day) {
    if (!isDate(day)) return { ok: false, field: 'installDate', message: 'מועד התקנה: תאריך מלא.' };
    customer.installDate = day;
  }
  return { ok: true, customer: Object.keys(customer).length ? customer : null };
}

/** Stored details (a project, a file): kept only when they still pass the check, else none. */
export function storedCustomer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !CUSTOMER_KEYS.includes(key))) return null;
  const checked = checkCustomer(value);
  return checked.ok ? checked.customer : null;
}

export const sameCustomer = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
