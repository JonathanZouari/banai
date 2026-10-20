// Catalog helpers. The catalog data itself is owned by the backend (served via the API);
// the client still validates it before use (defence in depth).
import { z } from 'zod';
import { DomainError, SCHEMA_INVALID } from './errors.js';
import { SAFE_TEXT_PATTERN, isVisibleText } from './schema.js';

export const SECTIONS = Object.freeze({ material: 'materials', color: 'colors', finish: 'finishes' });
// Door handle field -> catalog section.
export const HANDLE_SECTIONS = Object.freeze({ style: 'handleStyles', finish: 'handleFinishes' });

const HEX = /^#[0-9a-fA-F]{6}$/;
const entry = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  name: z.string().min(1).max(80).regex(SAFE_TEXT_PATTERN).refine(isVisibleText),
});
const catalogSchema = z.object({
  materials: z.array(entry).max(100),
  // `kind` drives the swatch look; `materials` lists where the colour is offered (a guide, not a rule).
  colors: z.array(entry.extend({
    hex: z.string().regex(HEX),
    kind: z.enum(['solid', 'wood']).default('solid'),
    materials: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(100).default([]),
  })).max(100),
  finishes: z.array(entry).max(100),
  handleStyles: z.array(entry).max(100),
  handleFinishes: z.array(entry.extend({ hex: z.string().regex(HEX), metalness: z.number().min(0).max(1) })).max(100),
});

/** Validate a catalog received from the server; throws DomainError when malformed. */
export function parseCatalog(data) {
  const result = catalogSchema.safeParse(data);
  if (!result.success) throw new DomainError(SCHEMA_INVALID, 'catalog', 'invalid catalog');
  const materials = new Set(result.data.materials.map((m) => m.id));
  if (result.data.colors.some((c) => c.materials.some((id) => !materials.has(id)))) {
    throw new DomainError(SCHEMA_INVALID, 'catalog', 'colour offered in an unknown material');
  }
  return result.data;
}

/** Colours offered in a material. A colour that lists no materials is offered everywhere. */
export const coloursFor = (catalog, materialId) =>
  catalog.colors.filter((c) => c.materials.length === 0 || c.materials.includes(materialId));

export const catalogIds = (catalog) =>
  Object.fromEntries(
    Object.entries(SECTIONS).map(([field, section]) => [field, new Set(catalog[section].map((e) => e.id))]),
  );

export const handleIds = (catalog) =>
  Object.fromEntries(
    Object.entries(HANDLE_SECTIONS).map(([field, section]) => [field, new Set(catalog[section].map((e) => e.id))]),
  );
