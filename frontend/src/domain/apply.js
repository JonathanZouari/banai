// Pure application of operations: applyOps(design, ops, catalog) -> new design.
// Mirrors backend/app/domain/apply.py. Each op runs on the engine's private canonical
// copy (handlers edit it and return it; caller input is never touched) and the result
// is fully re-validated. A batch is
// atomic: the whole batch is schema-checked first, then the first failing op throws.

import { DomainError, INVALID_OP } from './errors.js';
import { INTERIOR_HANDLERS } from './opsInterior.js';
import { ITEM_HANDLERS } from './opsItems.js';
import { parseOps } from './opsSchema.js';
import { STRUCTURE_HANDLERS } from './opsStructure.js';
import { parseDesign } from './schema.js';
import { validateCanonical } from './validation.js';

const HANDLERS = Object.freeze({ ...STRUCTURE_HANDLERS, ...ITEM_HANDLERS, ...INTERIOR_HANDLERS });

export function applyOps(design, ops, catalog) {
  const parsed = parseOps(ops);
  let current = design === null || design === undefined ? null : checked(design, catalog);
  parsed.forEach((op, index) => {
    current = applyOp(current, op, index, catalog);
  });
  if (current === null) throw new DomainError(INVALID_OP, 'ops', 'no design: the first op must be create_wardrobe');
  return current;
}

function applyOp(design, op, index, catalog) {
  const path = `ops[${index}]`;
  if (design === null && op.op !== 'create_wardrobe') {
    throw new DomainError(INVALID_OP, path, 'no design yet: start with create_wardrobe');
  }
  // `design` is always this call's own canonical copy (fresh from parseDesign), never
  // the caller's object, so handlers may edit it in place without another clone.
  return checked(HANDLERS[op.op](design, op, path), catalog);
}

function checked(design, catalog) {
  const canonical = parseDesign(design);
  const issues = validateCanonical(canonical, catalog);
  if (issues.length) throw issues[0];
  return canonical;
}
