// What a proposal would change, computed only from the designs (before vs. after), never from
// the agent's text. Pure and DOM-free; wording and units live in chat/diffText.js.
//
// A change is { type, group, subject, before?, after?, count?, values?, target?, from?, focus }:
// - type: 'changed' | 'added' | 'removed' | 'moved'
// - group: { kind: 'wardrobe' } | { kind: 'compartment', index } | { kind: 'doors' }. `index` is
//   1-based and left to right in the design array, the same number the editor shows.
// - focus: ids of the affected parts that exist in the *current* design (for a 3D highlight).

import { applyOps } from './apply.js';
import { ITEM_KINDS } from './util.js';

export const ITEM_SUBJECT = Object.freeze({ shelves: 'shelf', drawers: 'drawer', rails: 'rail' });
const APPEARANCE_FIELDS = Object.freeze(['material', 'color', 'finish']);
const WARDROBE = Object.freeze({ kind: 'wardrobe' });
const DOORS = Object.freeze({ kind: 'doors' });

/**
 * Apply `ops` to a copy of `design` and diff the result. Returns null when there is nothing to
 * replay (no ops) or the engine rejects them; the caller then falls back to the agent's rows.
 */
export function proposalChanges(design, ops, catalog) {
  if (!design || !Array.isArray(ops) || ops.length === 0) return null;
  try {
    return diffDesigns(design, applyOps(structuredClone(design), ops, catalog));
  } catch {
    return null;
  }
}

const refKey = (ref) => JSON.stringify(ref ?? null);

function appearanceChanges(before, after, group, target, focus) {
  return APPEARANCE_FIELDS
    .filter((field) => refKey(before?.[field]) !== refKey(after?.[field]))
    .map((field) => ({ type: 'changed', group, subject: field, target, before: before[field], after: after[field], focus }));
}

/** Every interior item by id: { kind, item, compartmentId }. */
function itemsById(design) {
  const items = new Map();
  design.compartments.forEach((compartment) => ITEM_KINDS.forEach((kind) => compartment[kind].forEach((item) => {
    items.set(item.id, { kind, item, compartmentId: compartment.id });
  })));
  return items;
}

function wardrobeChanges(before, after, rebuilt) {
  const changes = ['width', 'height', 'depth']
    .filter((key) => before.dimensions[key] !== after.dimensions[key])
    .map((key) => ({ type: 'changed', group: WARDROBE, subject: key, before: before.dimensions[key], after: after.dimensions[key], focus: ['carcass'] }));
  changes.push(...appearanceChanges(before.carcass.appearance, after.carcass.appearance, WARDROBE, { kind: 'carcass' }, ['carcass']));
  if (rebuilt) {
    // create_wardrobe replaces every compartment: one row instead of listing every old part as removed.
    changes.push({ type: 'changed', group: WARDROBE, subject: 'layout', before: before.compartments.length, after: after.compartments.length, focus: ['carcass'] });
    return changes;
  }
  const afterIds = new Set(after.compartments.map((c) => c.id));
  const beforeIds = new Set(before.compartments.map((c) => c.id));
  before.compartments.forEach((compartment, i) => {
    if (!afterIds.has(compartment.id)) {
      changes.push({ type: 'removed', group: WARDROBE, subject: 'compartment', index: i + 1, values: [compartment.width], focus: [compartment.id] });
    }
  });
  after.compartments.forEach((compartment, i) => {
    if (!beforeIds.has(compartment.id)) {
      changes.push({ type: 'added', group: WARDROBE, subject: 'compartment', index: i + 1, values: [compartment.width], focus: [] });
    }
  });
  after.partitions.forEach((partition, i) => {
    const old = before.partitions.find((p) => p.id === partition.id);
    if (old && old.thickness !== partition.thickness) {
      changes.push({ type: 'changed', group: WARDROBE, subject: 'partitionThickness', index: i + 1, before: old.thickness, after: partition.thickness, focus: [partition.id] });
    }
  });
  return changes;
}

function compartmentChanges(before, after, rebuilt) {
  const beforeItems = itemsById(before);
  const afterItems = itemsById(after);
  const beforeIndex = new Map(before.compartments.map((c, i) => [c.id, i + 1]));
  const changes = [];

  after.compartments.forEach((compartment, i) => {
    const group = Object.freeze({ kind: 'compartment', index: i + 1 });
    const old = rebuilt ? null : before.compartments.find((c) => c.id === compartment.id);
    const here = old ? [compartment.id] : [];
    if (old && old.width !== compartment.width) {
      changes.push({ type: 'changed', group, subject: 'compartmentWidth', before: old.width, after: compartment.width, focus: here });
    }
    ITEM_KINDS.forEach((kind) => {
      const subject = ITEM_SUBJECT[kind];
      const items = compartment[kind];
      if (old) {
        const removed = old[kind].filter((item) => !afterItems.has(item.id));
        if (removed.length) {
          changes.push({ type: 'removed', group, subject, count: removed.length, values: removed.map((item) => item.y).sort((a, b) => a - b), focus: removed.map((item) => item.id) });
        }
      }
      const added = items.filter((item) => !beforeItems.has(item.id) || rebuilt);
      if (added.length) {
        changes.push({ type: 'added', group, subject, count: added.length, values: added.map((item) => item.y).sort((a, b) => a - b), focus: here });
      }
      // Items that came from another compartment (a removed partition merges two compartments).
      const arrived = rebuilt ? [] : items.filter((item) => beforeItems.has(item.id) && beforeItems.get(item.id).compartmentId !== compartment.id);
      const sources = [...new Set(arrived.map((item) => beforeItems.get(item.id).compartmentId))];
      sources.forEach((source) => {
        const moved = arrived.filter((item) => beforeItems.get(item.id).compartmentId === source);
        changes.push({ type: 'moved', group, subject, count: moved.length, from: beforeIndex.get(source), values: moved.map((item) => item.y).sort((a, b) => a - b), focus: moved.map((item) => item.id) });
      });
      if (!old) return;
      items.forEach((item) => {
        const prior = beforeItems.get(item.id);
        if (!prior || prior.compartmentId !== compartment.id) return;
        const was = prior.item;
        if (was.y !== item.y) changes.push({ type: 'moved', group, subject, before: was.y, after: item.y, focus: [item.id] });
        if (kind === 'shelves' && was.thickness !== item.thickness) {
          changes.push({ type: 'changed', group, subject: 'shelfThickness', before: was.thickness, after: item.thickness, focus: [item.id] });
        }
        if (kind === 'drawers' && was.height !== item.height) {
          changes.push({ type: 'changed', group, subject: 'drawerHeight', before: was.height, after: item.height, focus: [item.id] });
        }
        // Only overrides: an inherited change is already one row on the wardrobe body.
        if (kind !== 'rails' && (was.appearance || item.appearance)) {
          changes.push(...appearanceChanges(
            was.appearance ?? before.carcass.appearance, item.appearance ?? after.carcass.appearance,
            group, { kind: subject }, [item.id],
          ));
        }
      });
    });
  });
  return changes;
}

function doorChanges(before, after) {
  const changes = [];
  const allDoors = before.doors.items.map((d) => d.id);
  const { doors: was } = before;
  const { doors: now } = after;
  if (was.type !== now.type) {
    changes.push({ type: 'changed', group: DOORS, subject: 'doorType', before: was.type, after: now.type, focus: allDoors });
  }
  if (was.items.length !== now.items.length && was.type !== 'none' && now.type !== 'none') {
    changes.push({ type: 'changed', group: DOORS, subject: 'doorCount', before: was.items.length, after: now.items.length, focus: allDoors });
  }
  if (now.type !== 'none') {
    changes.push(...appearanceChanges(was.appearance, now.appearance, DOORS, { kind: 'doors' }, allDoors));
  }
  now.items.forEach((door, i) => {
    const old = was.items.find((d) => d.id === door.id);
    if (!old) return;
    const target = { kind: 'door', index: i + 1 };
    if (old.hingeSide !== door.hingeSide) {
      changes.push({ type: 'changed', group: DOORS, subject: 'hinge', target, before: old.hingeSide, after: door.hingeSide, focus: [door.id] });
    }
    if (old.appearance || door.appearance) {
      changes.push(...appearanceChanges(old.appearance ?? was.appearance, door.appearance ?? now.appearance, DOORS, target, [door.id]));
    }
  });
  return changes;
}

/** Changes from `before` to `after`, ordered wardrobe, compartments left to right, then doors. */
export function diffDesigns(before, after) {
  const afterIds = new Set(after.compartments.map((c) => c.id));
  const rebuilt = !before.compartments.some((c) => afterIds.has(c.id));
  return [
    ...wardrobeChanges(before, after, rebuilt),
    ...compartmentChanges(before, after, rebuilt),
    ...doorChanges(before, after),
  ];
}

const groupKey = (group) => (group.kind === 'compartment' ? `compartment:${group.index}` : group.kind);

/** Consecutive changes in the same group, as [{ group, changes }] in diff order. */
export function groupChanges(changes) {
  const groups = [];
  changes.forEach((change) => {
    const last = groups.at(-1);
    if (last && groupKey(last.group) === groupKey(change.group)) last.changes.push(change);
    else groups.push({ group: change.group, changes: [change] });
  });
  return groups;
}
