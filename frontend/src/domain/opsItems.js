// Interior item, door tweak, appearance and handle op handlers. Mirrors backend/app/domain/ops_items.py.

import * as ids from './ids.js';
import { DEFAULT_SHELF_THICKNESS } from './defaults.js';
import { DomainError, INVALID_OP, NOT_FOUND } from './errors.js';
import { compartmentIndex, findDoor, findItem, locate } from './lookup.js';
import { isSet } from './util.js';

const APPEARANCE_FIELDS = ['material', 'color', 'finish'];
const HANDLE_FIELDS = ['style', 'finish'];

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
  draft.compartments[index].drawers.push({
    id: op.id || ids.newId(ids.DRAWER), y: op.y, height: op.height, appearance: null, handle: null,
  });
  return draft;
}

function modifyDrawer(draft, op, path) {
  requireAny(path, op.y, op.height);
  const drawer = findItem(draft, 'drawers', op.id, `${path}.id`);
  if (isSet(op.y)) drawer.y = op.y;
  if (isSet(op.height)) drawer.height = op.height;
  return draft;
}

function modifyDoor(draft, op, path) {
  requireAny(path, op.hingeSide, op.mirror);
  const door = findDoor(draft, op.id, `${path}.id`);
  // A hinge side that does not fit the door type is rejected by the door validation after the op.
  if (isSet(op.hingeSide)) door.hingeSide = op.hingeSide;
  if (isSet(op.mirror)) door.mirror = op.mirror;
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

function setHandles(draft, op, path) {
  const changes = Object.fromEntries(HANDLE_FIELDS.filter((f) => isSet(op[f])).map((f) => [f, op[f]]));
  const hasChanges = Object.keys(changes).length > 0;
  if (!hasChanges && !op.clear) throw new DomainError(INVALID_OP, path, 'give style, finish or clear');
  if (op.clear && hasChanges) throw new DomainError(INVALID_OP, path, 'clear cannot be combined with new values');

  if (op.target === 'all') {
    if (op.clear) throw new DomainError(INVALID_OP, `${path}.clear`, 'the design-wide handles cannot be cleared');
    draft.handles = { ...draft.handles, ...changes };
    return draft;
  }
  const owner = handleOwner(draft, op.target, `${path}.target`);
  owner.handle = op.clear ? null : { ...(owner.handle ?? draft.handles), ...changes };
  return draft;
}

function handleOwner(draft, target, path) {
  const found = locate(draft, target);
  if (!found) throw new DomainError(NOT_FOUND, path, 'no component with this id');
  const [kind, index, itemIndex] = found;
  if (kind === 'door') return draft.doors.items[index];
  if (kind === 'drawers') return draft.compartments[index][kind][itemIndex];
  throw new DomainError(INVALID_OP, path, 'only doors and drawers have handles');
}

function appearanceOwner(draft, target, path) {
  const found = locate(draft, target);
  if (!found) throw new DomainError(NOT_FOUND, path, 'no component with this id');
  const [kind, index, itemIndex] = found;
  if (kind === 'door') return [draft.doors.items[index], draft.doors.appearance];
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
  set_material: setMaterial,
  modify_door: modifyDoor,
  set_handles: setHandles,
});
