// Schema v2 interior op handlers: site, presets, inserts and door splitting.
// Mirrors backend/app/domain/ops_interior.py. Integer arithmetic only: halfUp matches the
// Python engine's _half_up (and Math.round for non-negative values).

import * as ids from './ids.js';
import { DEFAULT_SHOE_TIERS, DEFAULT_TROUSER_HEIGHT, PULLDOWN_DROP } from './defaults.js';
import { DomainError, INVALID_OP } from './errors.js';
import { interiorHeight } from './geometry.js';
import { compartmentIndex, findDoor, findInsert, requireRange } from './lookup.js';
import { isSet } from './util.js';

// Which optional fields each insert type takes. Everything else must be absent.
export const INSERT_FIELDS = Object.freeze({ shoes: ['y', 'tiers'], trousers: ['y', 'height'], pulldown: ['y'], led: [] });

const halfUp = (numerator, denominator) => Math.floor((2 * numerator + denominator) / (2 * denominator));

/** Shelf, rail and drawer positions (y, ascending) of an interior preset. Prototype defaults. */
export function presetItems(preset, interior) {
  const hat = interior - 330;
  let shelves = [];
  let rails = [];
  let drawers = [];
  if (preset === 'long') {
    shelves = [hat];
    rails = [hat - 70];
  } else if (preset === 'double') {
    const mid = halfUp(interior * 46, 100);
    shelves = [mid, hat];
    rails = [mid - 70, hat - 70];
  } else if (preset === 'shelves') {
    const count = Math.max(2, halfUp(interior, 360));
    shelves = Array.from({ length: count - 1 }, (_, i) => halfUp((i + 1) * interior, count));
  } else { // drawers: three drawers, a shelf over them, shelves above
    drawers = [0, 1, 2].map((k) => [k * 230, 224]);
    const top = 700;
    const count = Math.max(1, halfUp(interior - top, 360));
    shelves = [top, ...Array.from({ length: count - 1 }, (_, i) => top + halfUp((i + 1) * (interior - top), count))];
  }
  return { shelves, rails, drawers };
}

function applyPreset(draft, op, path) {
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  const compartment = draft.compartments[index];
  const items = presetItems(op.preset, interiorHeight(draft));
  // Deterministic ids, so replaying an approved proposal gives the same design.
  const tag = compartment.id.slice(ids.COMPARTMENT.length + 1).slice(0, 30);
  const thickness = draft.carcass.panelThickness;
  compartment.shelves = items.shelves.map((y, k) => ({ id: `${ids.SHELF}_${tag}_${k + 1}`, y, thickness, appearance: null }));
  compartment.rails = items.rails.map((y, k) => ({ id: `${ids.RAIL}_${tag}_${k + 1}`, y }));
  compartment.drawers = items.drawers.map(([y, height], k) => ({
    id: `${ids.DRAWER}_${tag}_${k + 1}`, y, height, appearance: null, handle: null,
  }));
  // Inserts that take an interior zone would clash with the new layout; lighting stays.
  compartment.inserts = compartment.inserts.filter((i) => i.type === 'led');
  return draft;
}

function rejectForeignFields(op, insertType, path) {
  for (const field of ['y', 'tiers', 'height']) {
    if (isSet(op[field]) && !INSERT_FIELDS[insertType].includes(field)) {
      throw new DomainError(INVALID_OP, `${path}.${field}`, `a ${insertType} insert has no ${field}`);
    }
  }
}

function addInsert(draft, op, path) {
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  rejectForeignFields(op, op.type, path);
  const item = { id: op.id || ids.newId(ids.INSERT), type: op.type, y: null, tiers: null, height: null };
  if (op.type === 'shoes') Object.assign(item, { y: op.y ?? 0, tiers: op.tiers ?? DEFAULT_SHOE_TIERS });
  else if (op.type === 'trousers') Object.assign(item, { y: op.y ?? 0, height: op.height ?? DEFAULT_TROUSER_HEIGHT });
  else if (op.type === 'pulldown') item.y = op.y ?? interiorHeight(draft) - PULLDOWN_DROP;
  draft.compartments[index].inserts.push(item);
  return draft;
}

function modifyInsert(draft, op, path) {
  if (!isSet(op.y) && !isSet(op.tiers) && !isSet(op.height)) throw new DomainError(INVALID_OP, path, 'nothing to change');
  const item = findInsert(draft, op.id, `${path}.id`);
  rejectForeignFields(op, item.type, path);
  for (const field of ['y', 'tiers', 'height']) if (isSet(op[field])) item[field] = op[field];
  return draft;
}

function setSite(draft, op, path) {
  const given = Object.fromEntries(['ceiling', 'niche'].filter((f) => isSet(op[f])).map((f) => [f, op[f]]));
  if (op.clear) {
    if (Object.keys(given).length) throw new DomainError(INVALID_OP, path, 'clear cannot be combined with new values');
    draft.site = null;
    return draft;
  }
  if (!Object.keys(given).length) throw new DomainError(INVALID_OP, path, 'give ceiling, niche or clear');
  for (const [field, value] of Object.entries(given)) requireRange(value, field, `${path}.${field}`);
  draft.site = { ceiling: null, niche: null, ...(draft.site ?? {}), ...given };
  return draft;
}

/** One hinged door over one compartment becomes a pair: left leaf hinged left, right leaf hinged right. */
function splitDoor(draft, op, path) {
  if (draft.doors.type !== 'hinged') throw new DomainError(INVALID_OP, path, 'only hinged doors can be split');
  const door = findDoor(draft, op.id, `${path}.id`);
  if (door.compartmentIds.length !== 1) {
    throw new DomainError(INVALID_OP, `${path}.id`, 'only a door over a single compartment can be split');
  }
  const [target] = door.compartmentIds;
  if (draft.doors.items.filter((d) => d.compartmentIds.includes(target)).length > 1) {
    throw new DomainError(INVALID_OP, `${path}.id`, 'this compartment already has two doors');
  }
  const twin = { ...structuredClone(door), id: op.newId || ids.newId(ids.DOOR), hingeSide: 'right', mirror: false };
  door.hingeSide = 'left';
  const { items } = draft.doors;
  items.splice(items.indexOf(door) + 1, 0, twin);
  return draft;
}

export const INTERIOR_HANDLERS = Object.freeze({
  apply_preset: applyPreset,
  add_insert: addInsert,
  modify_insert: modifyInsert,
  set_site: setSite,
  split_door: splitDoor,
});
