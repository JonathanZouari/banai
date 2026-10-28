// Canonical wardrobe schema (v1), integer millimetres. Mirrors backend/app/domain/schema.py.
// Structural shape only; cross-field rules live in validation.js. Inputs are untrusted:
// ints are bounded, lists capped, keys camelCase only, unknown keys rejected.

import { z } from 'zod';
import { DomainError, SCHEMA_INVALID } from './errors.js';
import * as ids from './ids.js';
import { isPlainObject, sum } from './util.js';

// Hard structural bounds (anti-abuse). Kept small: every op re-validates the whole
// design, so these caps bound the worst-case CPU of one request.
export const INT_BOUND = 1_000_000;
export const MAX_LIST = 100; // items of one kind in one compartment
export const MAX_COMPARTMENTS = 20;
export const MAX_DOORS = 20;
export const MAX_ITEMS_TOTAL = 300; // shelves + drawers + rails across the whole design
export const MAX_DOOR_SHELVES_TOTAL = 100; // shelves on the inside of doors, across all doors

// Free text from customers / the LLM: no control or bidi-override characters.
export const SAFE_TEXT_PATTERN = /^[^\x00-\x1f\x7f-\x9f\u200b-\u200d\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]+$/;
// Not blank, well-formed UTF-16 (no lone surrogates, which Python rejects), no Unicode tag
// characters (invisible text usable for prompt injection). Mirrors CustomRef._visible_name.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const isWellFormed = (value) => (typeof value.isWellFormed === 'function' ? value.isWellFormed() : !LONE_SURROGATE.test(value));
export const isVisibleText = (value) =>
  isWellFormed(value) && value.trim().length > 0 && !/[\u{E0000}-\u{E007F}]/u.test(value);
// Unknown keys are only named in an error path when they are plain identifiers.
const SAFE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export const int = () => z.number().int().min(-INT_BOUND).max(INT_BOUND);
export const typedId = (prefix) => z.string().regex(ids.idPattern(prefix));
export const list = (item) => z.array(item).max(MAX_LIST);

export const catalogRef = z.strictObject({ catalogId: z.string().regex(/^[a-z0-9_]{1,40}$/) });
export const customRef = z.strictObject({
  custom: z.literal(true),
  name: z.string().min(1).max(80).regex(SAFE_TEXT_PATTERN).refine(isVisibleText),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
});

// Tagged by presence of `custom`, identically to the pydantic Discriminator.
export const ref = z.unknown().transform((value, ctx) => {
  const branch = isPlainObject(value) && 'custom' in value ? customRef : catalogRef;
  const result = branch.safeParse(value);
  if (result.success) return result.data;
  result.error.issues.forEach((issue) => ctx.addIssue({ ...issue }));
  return z.NEVER;
});

export const appearance = z.strictObject({ material: ref, color: ref, finish: ref });
const override = appearance.nullable().default(null);

const shelf = z.strictObject({ id: typedId(ids.SHELF), y: int(), thickness: int(), appearance: override });
const drawer = z.strictObject({ id: typedId(ids.DRAWER), y: int(), height: int(), appearance: override });
const rail = z.strictObject({ id: typedId(ids.RAIL), y: int() });

const compartment = z.strictObject({
  id: typedId(ids.COMPARTMENT),
  width: int(),
  shelves: list(shelf),
  drawers: list(drawer),
  rails: list(rail),
});

const doorShelf = z.strictObject({ id: typedId(ids.DOOR_SHELF), y: int(), depth: int(), appearance: override });

const door = z.strictObject({
  id: typedId(ids.DOOR),
  compartmentIds: list(typedId(ids.COMPARTMENT)),
  hingeSide: z.enum(['left', 'right']).nullable().default(null),
  appearance: override,
  shelves: list(doorShelf).default([]), // absent in pre-door-shelf saves
});

export const designSchema = z.strictObject({
  schemaVersion: z.literal(1),
  units: z.literal('mm'),
  dimensions: z.strictObject({ width: int(), height: int(), depth: int() }),
  carcass: z.strictObject({ panelThickness: int(), appearance }),
  compartments: z.array(compartment).min(1).max(MAX_COMPARTMENTS).refine(
    (all) => sum(all.map((c) => c.shelves.length + c.drawers.length + c.rails.length)) <= MAX_ITEMS_TOTAL,
    { message: 'too many interior items' },
  ),
  partitions: z.array(z.strictObject({ id: typedId(ids.PARTITION), thickness: int() })).max(MAX_COMPARTMENTS),
  doors: z.strictObject({
    type: z.enum(['hinged', 'sliding', 'none']),
    appearance,
    items: z.array(door).max(MAX_DOORS).refine(
      (all) => sum(all.map((d) => d.shelves.length)) <= MAX_DOOR_SHELVES_TOTAL,
      { message: 'too many door shelves' },
    ),
  }),
});

export function formatPath(path) {
  return path.reduce(
    (out, part) => (typeof part === 'number' ? `${out}[${part}]` : out ? `${out}.${part}` : String(part)),
    '',
  );
}

/**
 * Engine-owned message and a safe path: never echoes attacker-controlled input.
 * zod reports unknown keys at the parent object; pydantic at the key itself, so the
 * key is appended, but only when it is a plain identifier.
 */
export function schemaError(issue, prefix = null) {
  const unknownKey = issue.code === 'unrecognized_keys';
  const key = unknownKey ? issue.keys[0] : null;
  const path = unknownKey && SAFE_KEY_PATTERN.test(key) ? [...issue.path, key] : issue.path;
  const message = unknownKey ? 'unknown field' : 'invalid or missing value';
  return new DomainError(SCHEMA_INVALID, prefix ?? formatPath(path), message);
}

/** Validate the structural shape and return the canonical (defaults-filled) design. */
export function parseDesign(data) {
  const result = designSchema.safeParse(data);
  if (!result.success) throw schemaError(result.error.issues[0]);
  return result.data;
}
