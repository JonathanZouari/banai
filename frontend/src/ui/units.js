// Display units. The design always stays in integer millimetres; only what is shown and typed changes.
// DEFAULT_UNIT is a configurable default, not a business rule. The choice is remembered per viewer
// (optional: storage may be unavailable and is never required).
export const UNITS = Object.freeze(['mm', 'cm', 'in']);
export const DEFAULT_UNIT = 'cm';
const STORAGE_KEY = 'banai.units';
const MAX_ABS_MM = 1_000_000;
const NUMBER_PATTERN = /^-?\d+([.,]\d+)?$/;

// perMm: how many millimetres make one unit. decimals: digits shown. example: shown in the input hint.
const SPEC = Object.freeze({
  mm: { perMm: 1, decimals: 0, example: '645' },
  cm: { perMm: 10, decimals: 1, example: '64.5' },
  in: { perMm: 25.4, decimals: 2, example: '25.5' },
});

export const isUnit = (value) => UNITS.includes(value);

/** A length as text without the unit, e.g. 2000 mm -> "200.0" (cm), "2000" (mm), "78.74" (in). */
export function formatLength(mm, unit = DEFAULT_UNIT) {
  const spec = SPEC[isUnit(unit) ? unit : DEFAULT_UNIT];
  return (mm / spec.perMm).toFixed(spec.decimals);
}

/** A length with its unit, e.g. "200.0 cm". */
export const lengthLabel = (mm, unit = DEFAULT_UNIT) => `${formatLength(mm, unit)} ${isUnit(unit) ? unit : DEFAULT_UNIT}`;

/** Parse typed text in `unit` (`.` or `,` decimal) to integer millimetres. */
export function parseLength(text, unit = DEFAULT_UNIT) {
  const spec = SPEC[isUnit(unit) ? unit : DEFAULT_UNIT];
  const name = isUnit(unit) ? unit : DEFAULT_UNIT;
  const trimmed = String(text ?? '').trim();
  if (!NUMBER_PATTERN.test(trimmed)) return { ok: false, code: 'NOT_A_NUMBER', unit: name, example: spec.example, message: `Enter a number in ${name}, e.g. ${spec.example}` };
  const mm = Math.round(Number(trimmed.replace(',', '.')) * spec.perMm);
  if (!Number.isFinite(mm) || Math.abs(mm) > MAX_ABS_MM) return { ok: false, code: 'TOO_LARGE', message: 'That value is too large' };
  return { ok: true, mm };
}

function readStored(storage) {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    return isUnit(value) ? value : null;
  } catch {
    return null;
  }
}

export function createUnits(storage = globalThis.localStorage) {
  let current = readStored(storage) ?? DEFAULT_UNIT;
  const listeners = new Set();
  return {
    get: () => current,
    set(next) {
      if (!isUnit(next)) return false;
      if (next === current) return true;
      current = next;
      try { storage?.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
      listeners.forEach((listener) => listener(current));
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The app-wide unit setting. */
export const units = createUnits();
