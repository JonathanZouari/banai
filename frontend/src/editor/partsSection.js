// Every selectable part as a button: the keyboard and screen-reader path to what the 3D view selects by
// pointer (WCAG 2.1.1). Ported to this branch's schema from dev's fd5b146 (keyboard access, IS 5568).
import { button, collapsibleSection, el } from './fields.js';
import { insertLabel } from './interiorOps.js';

const ITEM_GROUPS = Object.freeze([['shelves', 'מדף'], ['drawers', 'מגירה'], ['rails', 'מוט תלייה']]);

/** The parts in reading order: the body, the doors, the partitions, then each compartment's contents. */
export function listParts(design) {
  const doors = design.doors.items.map((door, i) => ({ id: door.id, label: `דלת ${i + 1}` }));
  const partitions = design.partitions.map((partition, i) => ({ id: partition.id, label: `מחיצה ${i + 1}` }));
  const contents = design.compartments.flatMap((compartment, c) => [
    ...ITEM_GROUPS.flatMap(([key, name]) => (compartment[key] ?? []).map((item, i) => ({ id: item.id, label: `תא ${c + 1} · ${name} ${i + 1}` }))),
    ...(compartment.inserts ?? []).map((insert) => ({ id: insert.id, label: `תא ${c + 1} · ${insertLabel(insert.type)}` })),
  ]);
  return [{ id: 'carcass', label: 'גוף הארון' }, ...doors, ...partitions, ...contents];
}

export function partsSection({ design, selection, select }) {
  const list = el('ul', { className: 'parts-list' }, listParts(design).map(({ id, label }) => {
    const node = button(label, () => select(id), { variant: 'link', testId: `part-${id}` });
    if (selection?.id === id) node.setAttribute('aria-current', 'true');
    return el('li', {}, [node]);
  }));
  return collapsibleSection('parts', 'כל החלקים', [list]);
}
