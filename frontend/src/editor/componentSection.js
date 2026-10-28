// Properties of the selected component; only the fields that apply to its kind.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, button, cmField, el, section, segmented } from './fields.js';
import { addItemOps, clearAppearanceOps, doorHingeOps, removeOps } from './opsFromForm.js';
import { partitionLeftEdge } from '../domain/geometry.js';
import { strings } from '../ui/i18n.js';

function findItem(design, kind, id) {
  const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails' }[kind];
  for (const compartment of design.compartments) {
    const item = compartment[key]?.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}

// `kind` is shelf, drawer or door: it names the finish and what clearing it falls back to.
function overrideControls({ catalog, item, inherited, run, kind }) {
  const t = strings();
  const appearance = item.appearance ?? inherited;
  const fallback = kind === 'door' ? t.useInherited.door : t.useInherited.carcass;
  return [
    appearanceControls({ catalog, appearance, target: item.id, run, label: t.finishes[kind] }),
    ...(item.appearance ? [button(fallback, () => run(clearAppearanceOps(item.id)), { variant: 'ghost' })] : []),
  ];
}

function fieldsFor(kind, { design, catalog, selection, run, runAction }) {
  const t = strings();
  const { id } = selection;
  const move = (op, field) => (mm) => run([{ op, id, [field]: mm }]);
  if (kind === 'shelf') {
    const shelf = findItem(design, kind, id);
    return [
      cmField({ label: t.heightFromBase, mm: shelf.y, testId: 'shelf-y', onCommit: move('modify_shelf', 'y') }),
      cmField({ label: t.thickness, mm: shelf.thickness, testId: 'shelf-thickness', onCommit: move('modify_shelf', 'thickness') }),
      ...overrideControls({ catalog, item: shelf, inherited: design.carcass.appearance, run: runAction, kind: 'shelf' }),
    ];
  }
  if (kind === 'drawer') {
    const drawer = findItem(design, kind, id);
    return [
      cmField({ label: t.heightFromBase, mm: drawer.y, testId: 'drawer-y', onCommit: move('modify_drawer', 'y') }),
      cmField({ label: t.drawerHeight, mm: drawer.height, testId: 'drawer-height', onCommit: move('modify_drawer', 'height') }),
      ...overrideControls({ catalog, item: drawer, inherited: design.carcass.appearance, run: runAction, kind: 'drawer' }),
    ];
  }
  if (kind === 'rail') {
    const rail = findItem(design, kind, id);
    return [cmField({ label: t.heightFromBase, mm: rail.y, testId: 'rail-y', onCommit: move('modify_rail', 'y') })];
  }
  if (kind === 'compartment') {
    const compartment = design.compartments.find((c) => c.id === id);
    return [
      cmField({ label: t.width, mm: compartment.width, testId: 'compartment-width', onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: id, width: mm }]) }),
      el('div', { className: 'button-row' }, ['shelf', 'drawer', 'rail'].map((item) =>
        button(t.add[item], () => runAction(addItemOps(design, id, item)), { testId: `add-${item}` }))),
    ];
  }
  if (kind === 'partition') {
    const index = design.partitions.findIndex((p) => p.id === id);
    return [
      cmField({ label: t.positionFromLeft, mm: partitionLeftEdge(design, index), testId: 'partition-position', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, position: mm }]) }),
      cmField({ label: t.thickness, mm: design.partitions[index].thickness, testId: 'partition-thickness', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, thickness: mm }]) }),
    ];
  }
  if (kind === 'door') {
    const door = design.doors.items.find((d) => d.id === id);
    return [
      ...(design.doors.type === 'hinged' ? [segmented({
        label: t.hingeSide, value: door.hingeSide, testId: 'hinge-side',
        options: ['left', 'right'].map((value) => ({ value, label: t.sides[value] })),
        onChange: (side) => runAction(doorHingeOps(design, id, side)),
      })] : []),
      ...overrideControls({ catalog, item: door, inherited: design.doors.appearance, run: runAction, kind: 'door' }),
    ];
  }
  return [el('p', { className: 'panel__note', text: t.carcassNote })];
}

export function componentSection({ design, catalog, selection, run, select }) {
  const t = strings();
  const kindName = t.kinds[selection.kind];
  const container = section(t.selected(kindName), []);
  container.dataset.testid = 'selected-section';
  // Inputs report their own errors inline; buttons/selects report under the section.
  const runAction = (ops) => actionResult(container, run(ops));
  container.append(...fieldsFor(selection.kind, { design, catalog, selection, run, runAction }));
  const actions = [button(t.deselect, () => select(null), { variant: 'ghost' })];
  if (selection.kind !== 'carcass') {
    actions.unshift(button(t.deleteKind(kindName), () => runAction(removeOps(selection.id)), { variant: 'danger', testId: 'delete-selected' }));
  }
  container.append(el('div', { className: 'button-row' }, actions));
  return container;
}
