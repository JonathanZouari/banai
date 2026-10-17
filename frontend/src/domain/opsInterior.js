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
  if (isSet(op.zone)) return applyZonePreset(draft, compartment, op, path);
  if (dividers(compartment).length) throw new DomainError(INVALID_OP, `${path}.zone`, 'this compartment has zones: give a zone');
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
  const sameGroup = (d) => d.compartmentIds.length === 1 && d.compartmentIds[0] === door.compartmentIds[0]
    && (d.bottomShelfId ?? null) === (door.bottomShelfId ?? null) && (d.topShelfId ?? null) === (door.topShelfId ?? null);
  if (draft.doors.items.filter(sameGroup).length > 1) {
    throw new DomainError(INVALID_OP, `${path}.id`, 'this compartment already has two doors');
  }
  const twin = { ...structuredClone(door), id: op.newId || ids.newId(ids.DOOR), hingeSide: 'right', mirror: false };
  door.hingeSide = 'left';
  const { items } = draft.doors;
  items.splice(items.indexOf(door) + 1, 0, twin);
  return draft;
}

// ---- zones (docs/schema.md "Zones"); mirrors backend/app/domain/ops_interior.py ----
export const ZONE_SNAP = 60; // mm: an existing shelf this close to a divider's target centre becomes the divider

/** The compartment's fixed shelves, bottom-up (ties keep list order). */
export function dividers(compartment) {
  return compartment.shelves.filter((s) => s.fixed).sort((a, b) => a.y - b.y);
}

export function zoneAnchors(compartment, zone) {
  const fixed = dividers(compartment);
  return [zone >= 2 ? fixed[zone - 2].id : null, zone <= fixed.length ? fixed[zone - 1].id : null];
}

/** Interior y range inside zone `zone` (1-based): between the dividers' faces. */
export function zoneUsable(draft, compartment, zone) {
  const fixed = dividers(compartment);
  const low = zone === 1 ? 0 : fixed[zone - 2].y + fixed[zone - 2].thickness;
  const high = zone === fixed.length + 1 ? interiorHeight(draft) : fixed[zone - 1].y;
  return [low, high];
}

function requireZone(compartment, zone, path) {
  if (!(zone >= 1 && zone <= dividers(compartment).length + 1)) {
    throw new DomainError(INVALID_OP, `${path}.zone`, 'there is no such zone in this compartment');
  }
}

/** Doors over this compartment alone. A door that also spans neighbours blocks zone edits. */
function ownDoors(draft, compartmentId, path) {
  const { items } = draft.doors;
  if (items.some((d) => d.compartmentIds.includes(compartmentId) && d.compartmentIds.length > 1)) {
    throw new DomainError(INVALID_OP, `${path}.compartmentId`, 'a door spans this compartment and its neighbours');
  }
  return items.filter((d) => d.compartmentIds.length === 1 && d.compartmentIds[0] === compartmentId);
}

/** `base`, or `base_2`, `base_3`... when taken (deterministic in both engines). */
function freeId(draft, base) {
  const taken = new Set([...draft.compartments.flatMap((c) => c.shelves.map((s) => s.id)), ...draft.doors.items.map((d) => d.id)]);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

const zoneDoor = (id, compartmentId, hingeSide, [bottomShelfId, topShelfId], template) => ({
  id, compartmentIds: [compartmentId], hingeSide,
  appearance: template ? template.appearance : null, handle: template ? template.handle : null,
  mirror: false, bottomShelfId, topShelfId,
});
const tagOf = (compartment) => compartment.id.slice(ids.COMPARTMENT.length + 1).slice(0, 30);

function setZones(draft, op, path) {
  requireRange(op.count, 'zones', `${path}.count`);
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  const compartment = draft.compartments[index];
  const own = draft.doors.type === 'hinged' ? ownDoors(draft, compartment.id, path) : [];
  const tag = tagOf(compartment);
  const interior = interiorHeight(draft);
  const panel = draft.carcass.panelThickness;
  compartment.shelves.forEach((s) => { s.fixed = false; });
  const chosen = [];
  for (let k = 1; k < op.count; k += 1) {
    const target = halfUp(k * interior, op.count);
    const near = compartment.shelves
      .map((s, i) => [Math.abs(2 * s.y + s.thickness - 2 * target), s.y, i, s])
      .filter(([d, , , s]) => !chosen.includes(s) && d <= 2 * ZONE_SNAP)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    let shelf;
    if (near.length) {
      [[, , , shelf]] = near;
    } else {
      shelf = { id: freeId(draft, `${ids.SHELF}_${tag}_z${k}`), y: target - Math.floor(panel / 2), thickness: panel, appearance: null, fixed: false };
      compartment.shelves.push(shelf);
    }
    shelf.fixed = true;
    chosen.push(shelf);
  }
  if (own.length) {
    const [template] = own;
    const { items } = draft.doors;
    const at = items.indexOf(template);
    own.forEach((door) => items.splice(items.indexOf(door), 1));
    const fresh = op.count === 1
      ? [zoneDoor(template.id, compartment.id, template.hingeSide, [null, null], template)]
      : Array.from({ length: op.count }, (_, i) => zoneDoor(
        `${ids.DOOR}_${tag}_z${i + 1}`, compartment.id, template.hingeSide, zoneAnchors(compartment, i + 1), template));
    items.splice(at, 0, ...fresh);
  }
  return draft;
}

function setZoneDoor(draft, op, path) {
  if (draft.doors.type !== 'hinged') throw new DomainError(INVALID_OP, path, 'zone doors are hinged doors');
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  const compartment = draft.compartments[index];
  requireZone(compartment, op.zone, path);
  if (op.leaves === 2 && isSet(op.hingeSide)) throw new DomainError(INVALID_OP, `${path}.hingeSide`, 'a pair is hinged on both sides');
  const own = ownDoors(draft, compartment.id, path);
  const anchors = zoneAnchors(compartment, op.zone);
  const removed = own.filter((d) => d.bottomShelfId === anchors[0] && d.topShelfId === anchors[1]);
  const { items } = draft.doors;
  let at;
  if (removed.length) at = items.indexOf(removed[0]);
  else if (own.length) at = items.indexOf(own[own.length - 1]) + 1;
  else at = items.length;
  removed.forEach((door) => items.splice(items.indexOf(door), 1));
  const template = removed[0] ?? null;
  const base = `${ids.DOOR}_${tagOf(compartment)}_z${op.zone}`;
  let fresh = [];
  if (op.leaves === 1) {
    const hinge = op.hingeSide || template?.hingeSide || 'left';
    fresh = [zoneDoor(freeId(draft, base), compartment.id, hinge, anchors, template)];
  } else if (op.leaves === 2) {
    fresh = [zoneDoor(freeId(draft, base), compartment.id, 'left', anchors, template),
      zoneDoor(freeId(draft, `${base}r`), compartment.id, 'right', anchors, template)];
  }
  items.splice(at, 0, ...fresh);
  return draft;
}

/** Rebuild one zone: its regular items are replaced by the preset for the zone's height, clipped to fit. */
function applyZonePreset(draft, compartment, op, path) {
  requireZone(compartment, op.zone, path);
  const [low, high] = zoneUsable(draft, compartment, op.zone);
  const inside = (y) => y !== null && y !== undefined && low <= y && y < high;
  const thickness = draft.carcass.panelThickness;
  const height = high - low;
  const items = presetItems(op.preset, height);
  const tag = `${tagOf(compartment)}_z${op.zone}`;
  const shelves = items.shelves.filter((y) => y >= 0 && y + thickness <= height);
  const rails = items.rails.filter((y) => y >= 0 && y <= height);
  const drawers = items.drawers.filter(([y, h]) => y >= 0 && y + h <= height);
  compartment.shelves = [...compartment.shelves.filter((s) => s.fixed || !inside(s.y)),
    ...shelves.map((y, k) => ({ id: `${ids.SHELF}_${tag}_${k + 1}`, y: low + y, thickness, appearance: null, fixed: false }))];
  compartment.rails = [...compartment.rails.filter((r) => !inside(r.y)),
    ...rails.map((y, k) => ({ id: `${ids.RAIL}_${tag}_${k + 1}`, y: low + y }))];
  compartment.drawers = [...compartment.drawers.filter((d) => !inside(d.y)),
    ...drawers.map(([y, h], k) => ({ id: `${ids.DRAWER}_${tag}_${k + 1}`, y: low + y, height: h, appearance: null, handle: null }))];
  compartment.inserts = compartment.inserts.filter((i) => i.type === 'led' || !inside(i.y));
  return draft;
}

export const INTERIOR_HANDLERS = Object.freeze({
  apply_preset: applyPreset,
  add_insert: addInsert,
  modify_insert: modifyInsert,
  set_site: setSite,
  split_door: splitDoor,
  set_zones: setZones,
  set_zone_door: setZoneDoor,
});
