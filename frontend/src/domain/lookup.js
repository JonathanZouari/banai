// Component lookup helpers for op handlers (operate on draft copies). Mirrors lookup.py.

import { DomainError, NOT_FOUND } from './errors.js';
import { ITEM_KINDS } from './util.js';
import { rangeIssue } from './validation.js';

export { ITEM_KINDS };

export function compartmentIndex(design, compartmentId, path) {
  const index = design.compartments.findIndex((c) => c.id === compartmentId);
  if (index < 0) throw new DomainError(NOT_FOUND, path, 'no compartment with this id');
  return index;
}

export function partitionIndex(design, partitionId, path) {
  const index = design.partitions.findIndex((p) => p.id === partitionId);
  if (index < 0) throw new DomainError(NOT_FOUND, path, 'no partition with this id');
  return index;
}

export function findItem(design, kind, itemId, path) {
  for (const compartment of design.compartments) {
    const item = compartment[kind].find((i) => i.id === itemId);
    if (item) return item;
  }
  throw new DomainError(NOT_FOUND, path, `no ${kind.slice(0, -1)} with this id`);
}

export function findDoorShelf(design, shelfId, path) {
  for (const door of design.doors.items) {
    const shelf = door.shelves.find((s) => s.id === shelfId);
    if (shelf) return shelf;
  }
  throw new DomainError(NOT_FOUND, path, 'no door shelf with this id');
}

/** Returns [kind, index, itemIndex] for any component id, or null. */
export function locate(design, componentId) {
  for (const [ci, compartment] of design.compartments.entries()) {
    if (compartment.id === componentId) return ['compartment', ci, -1];
    for (const kind of ITEM_KINDS) {
      const ii = compartment[kind].findIndex((i) => i.id === componentId);
      if (ii >= 0) return [kind, ci, ii];
    }
  }
  const pi = design.partitions.findIndex((p) => p.id === componentId);
  if (pi >= 0) return ['partition', pi, -1];
  for (const [di, door] of design.doors.items.entries()) {
    if (door.id === componentId) return ['door', di, -1];
    const si = door.shelves.findIndex((s) => s.id === componentId);
    if (si >= 0) return ['doorShelves', di, si];
  }
  return null;
}

export function requireRange(value, limit, path) {
  const issue = rangeIssue(value, limit, path);
  if (issue) throw issue;
}
