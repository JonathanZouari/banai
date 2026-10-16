// Component-level diff between two designs, used to style a proposal preview.
// Pure and id-based: ids are stable, so "same id, different data" means modified.

const ITEM_KEYS = Object.freeze({ shelves: 'shelf', drawers: 'drawer', rails: 'rail' });

/** Map of componentId -> { kind, key } where key is a comparable JSON fingerprint. */
function fingerprint(design) {
  const map = new Map();
  map.set('carcass', { kind: 'carcass', key: JSON.stringify([design.dimensions, design.carcass]) });
  design.compartments.forEach((compartment) => {
    map.set(compartment.id, { kind: 'compartment', key: String(compartment.width) });
    Object.entries(ITEM_KEYS).forEach(([list, kind]) => {
      compartment[list].forEach((item) => map.set(item.id, { kind, key: JSON.stringify(item), compartmentId: compartment.id }));
    });
  });
  design.partitions.forEach((partition) => map.set(partition.id, { kind: 'partition', key: JSON.stringify(partition) }));
  design.doors.items.forEach((door) => map.set(door.id, {
    kind: 'door', key: JSON.stringify([door, design.doors.type, design.doors.appearance]),
  }));
  return map;
}

/** { added, modified, removed }: arrays of component ids (removed ids exist only in `before`). */
export function diffDesigns(before, after) {
  const a = fingerprint(before);
  const b = fingerprint(after);
  const added = [];
  const modified = [];
  const removed = [];
  b.forEach((entry, id) => {
    if (!a.has(id)) added.push(id);
    else if (a.get(id).key !== entry.key) modified.push(id);
  });
  a.forEach((_, id) => {
    if (!b.has(id)) removed.push(id);
  });
  return { added, modified, removed };
}

export const isEmptyDiff = ({ added, modified, removed }) => !added.length && !modified.length && !removed.length;
