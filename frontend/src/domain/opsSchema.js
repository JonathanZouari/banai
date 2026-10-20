// Typed operation protocol (discriminated on `op`). Mirrors backend/app/domain/ops.py.
// Ops may come from an LLM: ids are pattern-checked, ints bounded, lists capped,
// and optional fields accept explicit null (pydantic `X | None = None`).

import { z } from 'zod';
import { DomainError, SCHEMA_INVALID } from './errors.js';
import * as ids from './ids.js';
import {
  MAX_ROOM_OPENINGS, MAX_ROOM_FURNITURE, MAX_SITE_OBSTACLES, furnitureItem, SAFE_TEXT_PATTERN, opening, roomShape, handleFinish, handleStyle, insertType, int, isVisibleText, list, obstacle, ref, schemaError, typedId,
} from './schema.js';

export const MAX_OPS = 100;

const opt = (schema) => schema.nullish();
const op = (name, shape) => z.strictObject({ op: z.literal(name), ...shape });
const cmpId = () => typedId(ids.COMPARTMENT);

export const opSchema = z.discriminatedUnion('op', [
  op('create_wardrobe', {
    width: int(), height: int(), depth: int(), compartmentCount: int(),
    panelThickness: opt(int()), partitionThickness: opt(int()), plinthHeight: opt(int()),
    compartmentIds: opt(list(cmpId())), partitionIds: opt(list(typedId(ids.PARTITION))),
  }),
  op('update_dimensions', { width: opt(int()), height: opt(int()), depth: opt(int()), plinthHeight: opt(int()) }),
  op('configure_doors', {
    type: z.enum(['hinged', 'sliding', 'none']),
    doors: opt(list(z.strictObject({
      id: opt(typedId(ids.DOOR)), compartmentIds: list(cmpId()), hingeSide: z.enum(['left', 'right']),
    }))),
    count: opt(int()),
    ids: opt(list(typedId(ids.DOOR))),
  }),
  op('modify_door', { id: typedId(ids.DOOR), hingeSide: opt(z.enum(['left', 'right'])), mirror: opt(z.boolean()) }),
  op('add_compartment', {
    position: int(), width: int(), id: opt(cmpId()), partitionId: opt(typedId(ids.PARTITION)), partitionThickness: opt(int()),
  }),
  op('modify_compartment', { compartmentId: cmpId(), width: int() }),
  op('add_partition', {
    compartmentId: cmpId(), offset: int(), id: opt(typedId(ids.PARTITION)), newCompartmentId: opt(cmpId()), thickness: opt(int()),
  }),
  op('modify_partition', { partitionId: typedId(ids.PARTITION), position: opt(int()), thickness: opt(int()) }),
  op('add_shelf', { compartmentId: cmpId(), y: int(), thickness: opt(int()), id: opt(typedId(ids.SHELF)) }),
  op('modify_shelf', { id: typedId(ids.SHELF), y: opt(int()), thickness: opt(int()) }),
  op('add_drawer', { compartmentId: cmpId(), y: int(), height: int(), id: opt(typedId(ids.DRAWER)) }),
  op('modify_drawer', { id: typedId(ids.DRAWER), y: opt(int()), height: opt(int()) }),
  op('add_rail', { compartmentId: cmpId(), y: int(), id: opt(typedId(ids.RAIL)) }),
  op('modify_rail', { id: typedId(ids.RAIL), y: int() }),
  op('set_material', {
    target: z.string().regex(ids.TARGET_PATTERN),
    material: opt(ref), color: opt(ref), finish: opt(ref),
    clear: z.boolean().default(false),
  }),
  op('set_handles', {
    target: z.string().regex(ids.HANDLES_TARGET_PATTERN),
    style: opt(handleStyle), finish: opt(handleFinish),
    clear: z.boolean().default(false),
  }),
  op('remove_component', { id: z.string().regex(ids.ANY_ID_PATTERN) }),
  // ---- schema v2 ----
  op('set_fittings', {
    softClose: opt(z.boolean()), base: opt(z.enum(['plinth', 'legs'])), childLock: opt(z.boolean()), releaseHeight: opt(int()),
  }),
  op('set_household', {
    people: z.array(z.strictObject({
      name: z.string().refine((s) => [...s].length >= 1 && [...s].length <= 30).regex(SAFE_TEXT_PATTERN).refine(isVisibleText).nullish(),
      height: int(),
      at: opt(z.array(int()).length(2)),
    })).max(6),
  }),
  op('set_room', {
    shape: opt(roomShape), wall: opt(int()), offset: opt(int()), openings: opt(z.array(opening).max(MAX_ROOM_OPENINGS)),
    furniture: opt(z.array(furnitureItem).max(MAX_ROOM_FURNITURE)), // replaces the list (ADR-041)
    clear: z.boolean().default(false),
  }),
  op('set_site', {
    ceiling: opt(int()), niche: opt(int()),
    heights: opt(z.array(int().nullable()).length(3)), widths: opt(z.array(int().nullable()).length(3)),
    clearance: opt(int()),
    obstacles: opt(z.array(obstacle).max(MAX_SITE_OBSTACLES)), // replaces the list; [] clears it
    unset: z.array(z.enum(['ceiling', 'niche', 'heights', 'widths', 'clearance', 'obstacles'])).max(6).default([]),
    clear: z.boolean().default(false),
  }),
  op('apply_preset', { compartmentId: cmpId(), preset: z.enum(['long', 'double', 'shelves', 'drawers']), zone: opt(int()) }),
  op('set_zones', { compartmentId: cmpId(), count: int() }),
  op('set_zone_door', {
    compartmentId: cmpId(), zone: int(), leaves: z.union([z.literal(0), z.literal(1), z.literal(2)]), hingeSide: opt(z.enum(['left', 'right'])),
  }),
  op('add_insert', {
    compartmentId: cmpId(), type: insertType, y: opt(int()), tiers: opt(int()), height: opt(int()), id: opt(typedId(ids.INSERT)),
  }),
  op('modify_insert', { id: typedId(ids.INSERT), y: opt(int()), tiers: opt(int()), height: opt(int()) }),
  op('split_door', { id: typedId(ids.DOOR), newId: opt(typedId(ids.DOOR)) }),
]);

/** Validate the batch container, then each op (error path `ops[i]`). */
export function parseOps(rawOps) {
  if (!Array.isArray(rawOps)) throw new DomainError(SCHEMA_INVALID, 'ops', 'ops must be an array');
  if (rawOps.length > MAX_OPS) throw new DomainError(SCHEMA_INVALID, 'ops', `at most ${MAX_OPS} ops per batch`);
  return rawOps.map(parseOp);
}

export function parseOp(raw, index) {
  const result = opSchema.safeParse(raw);
  if (!result.success) throw schemaError(result.error.issues[0], `ops[${index}]`);
  return result.data;
}
