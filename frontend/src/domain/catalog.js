// Catalog helpers. The catalog data itself is owned by the backend (served via the API);
// the client still validates it before use (defence in depth).
import { z } from 'zod';
import { DomainError, SCHEMA_INVALID } from './errors.js';
import { SAFE_TEXT_PATTERN, isVisibleText } from './schema.js';

export const SECTIONS = Object.freeze({ material: 'materials', color: 'colors', finish: 'finishes' });

const HEX = /^#[0-9a-fA-F]{6}$/;
const entry = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  name: z.string().min(1).max(80).regex(SAFE_TEXT_PATTERN).refine(isVisibleText),
});
const catalogSchema = z.object({
  materials: z.array(entry).max(100),
  colors: z.array(entry.extend({ hex: z.string().regex(HEX) })).max(100),
  finishes: z.array(entry).max(100),
});

/** Validate a catalog received from the server; throws DomainError when malformed. */
export function parseCatalog(data) {
  const result = catalogSchema.safeParse(data);
  if (!result.success) throw new DomainError(SCHEMA_INVALID, 'catalog', 'invalid catalog');
  return result.data;
}

export const catalogIds = (catalog) =>
  Object.fromEntries(
    Object.entries(SECTIONS).map(([field, section]) => [field, new Set(catalog[section].map((e) => e.id))]),
  );

// Wood tones (catalog colour ids) and veneer materials, rendered with a wood-grain texture and
// grouped as "Wood" in the editor. A presentation hint only: domain rules treat them like any colour.
export const WOOD_COLOR_IDS = Object.freeze(new Set(['light_oak', 'natural_oak', 'teak', 'smoked_oak', 'walnut', 'wenge']));
export const VENEER_MATERIAL_ID = 'oak_veneer';
export const isWoodColor = (ref) => Boolean(ref && !ref.custom && WOOD_COLOR_IDS.has(ref.catalogId));
export const isWoodAppearance = (appearance) =>
  isWoodColor(appearance.color) || (!appearance.material.custom && appearance.material.catalogId === VENEER_MATERIAL_ID);
