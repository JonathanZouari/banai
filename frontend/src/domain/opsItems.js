// Interior item, door shelf and appearance op handlers. Mirrors backend/app/domain/ops_items.py.

import * as ids from './ids.js';
import { DEFAULT_DOOR_SHELF_DEPTH, DEFAULT_SHELF_THICKNESS } from './defaults.js';
import { DomainError, INVALID_OP, NOT_FOUND } from './errors.js';
import { compartmentIndex, findDoorShelf, findItem, locate } from './lookup.js';
import { isSet } from './util.js';

const APPEARANCE_FIELDS = ['material', 'color', 'finish'];

function requireAny(path, ...values) {
  if (values.every((v) => !isSet(v))) throw new DomainError(INVALID_OP, path, 'nothing to change');
}

function addShelf(draft, op, path) {
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  draft.compartments[index].shelves.push({
    id: op.id || ids.newId(ids.SHELF), y: op.y, thickness: op.thickness ?? DEFAULT_SHELF_THICKNESS, appearance: null,
  });
  return draft;
}

function modifyShelf(draft, op, path) {
  requireAny(path, op.y, op.thickness);
  const shelf = findItem(draft, 'shelves', op.id, `${path}.id`);
  if (isSet(op.y)) shelf.y = op.y;
  if (isSet(op.thickness)) shelf.thickness = op.thickness;
  return draft;
}

function addDrawer(draft, op, path) {
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  draft.compartments[index].drawers.push({ id: op.id || ids.newId(ids.DRAWER), y: op.y, height: op.height, appearance: null });
  return draft;
}

function modifyDrawer(draft, op, path) {
  requireAny(path, op.y, op.height);
  const drawer = findItem(draft, 'drawers', op.id, `${path}.id`);
  if (isSet(op.y)) drawer.y = op.y;
  if (isSet(op.height)) drawer.height = op.height;
  return draft;
}

function addRail(draft, op, path) {
  const index = compartmentIndex(draft, op.compartmentId, `${path}.compartmentId`);
  draft.compartments[index].rails.push({ id: op.id || ids.newId(ids.RAIL), y: op.y });
  return draft;
}

function modifyRail(draft, op, path) {
  findItem(draft, 'rails', op.id, `${path}.id`).y = op.y;
  return draft;
}

function addDoorShelf(draft, op, path) {
  const door = draft.doors.items.find((d) => d.id === op.doorId);
  if (!door) throw new DomainError(NOT_FOUND, `${path}.doorId`, 'no door with this id');
  if (draft.doors.type !== 'hinged') throw new DomainError(INVALID_OP, `${path}.doorId`, 'door shelves need hinged doors');
  door.shelves.push({ id: op.id || ids.newId(ids.DOOR_SHELF), y: op.y, depth: op.depth ?? DEFAULT_DOOR_SHELF_DEPTH, appearance: null });
  return draft;
}

function modifyDoorShelf(draft, op, path) {
  requireAny(path, op.y, op.depth);
  const shelf = findDoorShelf(draft, op.id, `${path}.id`);
  if (isSet(op.y)) shelf.y = op.y;
  if (isSet(op.depth)) shelf.depth = op.depth;
  return draft;
}

function setMaterial(draft, op, path) {
  const changes = Object.fromEntries(APPEARANCE_FIELDS.filter((f) => isSet(op[f])).map((f) => [f, op[f]]));
  const hasChanges = Object.keys(changes).length > 0;
  if (!hasChanges && !op.clear) throw new DomainError(INVALID_OP, path, 'give material, color, finish or clear');
  if (op.clear && hasChanges) throw new DomainError(INVALID_OP, path, 'clear cannot be combined with new values');

  if (op.target === 'carcass' || op.target === 'doors') {
    if (op.clear) throw new DomainError(INVALID_OP, `${path}.clear`, 'carcass and doors appearance cannot be cleared');
    const owner = op.target === 'carcass' ? draft.carcass : draft.doors;
    owner.appearance = { ...owner.appearance, ...changes };
    return draft;
  }
  const [owner, inherited] = appearanceOwner(draft, op.target, `${path}.target`);
  owner.appearance = op.clear ? null : { ...(owner.appearance ?? inherited), ...changes };
  return draft;
}

function appearanceOwner(draft, target, path) {
  const found = locate(draft, target);
  if (!found) throw new DomainError(NOT_FOUND, path, 'no component with this id');
  const [kind, index, itemIndex] = found;
  if (kind === 'door') return [draft.doors.items[index], draft.doors.appearance];
  if (kind === 'doorShelves') {
    const door = draft.doors.items[index];
    return [door.shelves[itemIndex], door.appearance ?? draft.doors.appearance];
  }
  if (kind === 'shelves' || kind === 'drawers') return [draft.compartments[index][kind][itemIndex], draft.carcass.appearance];
  throw new DomainError(INVALID_OP, path, `${kind} has no own appearance`);
}

export const ITEM_HANDLERS = Object.freeze({
  add_shelf: addShelf,
  modify_shelf: modifyShelf,
  add_drawer: addDrawer,
  modify_drawer: modifyDrawer,
  add_rail: addRail,
  modify_rail: modifyRail,
  add_door_shelf: addDoorShelf,
  modify_door_shelf: modifyDoorShelf,
  set_material: setMaterial,
});
