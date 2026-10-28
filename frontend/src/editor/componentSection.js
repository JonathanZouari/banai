// Properties of the selected component; only the fields that apply to its kind.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, button, cmField, el, section, segmented } from './fields.js';
import { addItemOps, clearAppearanceOps, doorFrontOps, doorHingeOps, removeOps } from './opsFromForm.js';
import { partitionLeftEdge } from '../domain/geometry.js';
import { t, tf } from '../i18n/strings.js';

const TITLE_KEYS = Object.freeze({
  shelf: 'edShelf', drawer: 'edDrawer', rail: 'edRail', compartment: 'edCompartment', partition: 'edPartition', door: 'edDoor', carcass: 'edCarcassBody',
});
const title = (kind) => t(TITLE_KEYS[kind]);

function findItem(design, kind, id) {
  const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails' }[kind];
  for (const compartment of design.compartments) {
    const item = compartment[key]?.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}

function overrideControls({ catalog, design, item, inherited, run, label, inheritedFrom }) {
  const appearance = item.appearance ?? inherited;
  return [
    appearanceControls({ catalog, appearance, target: item.id, run, label }),
    ...(item.appearance ? [button(t(inheritedFrom === 'door' ? 'edUseDoorFinish' : 'edUseCarcassFinish'), () => run(clearAppearanceOps(item.id)), { variant: 'ghost' })] : []),
  ];
}

function fieldsFor(kind, { design, catalog, selection, run, runAction }) {
  const { id } = selection;
  const move = (op, field) => (mm) => run([{ op, id, [field]: mm }]);
  if (kind === 'shelf') {
    const shelf = findItem(design, kind, id);
    return [
      cmField({ label: t('edHeightFromBase'), mm: shelf.y, testId: 'shelf-y', onCommit: move('modify_shelf', 'y') }),
      cmField({ label: t('edThickness'), mm: shelf.thickness, testId: 'shelf-thickness', onCommit: move('modify_shelf', 'thickness') }),
      ...overrideControls({ catalog, design, item: shelf, inherited: design.carcass.appearance, run: runAction, label: t('edShelfFinish'), inheritedFrom: 'carcass' }),
    ];
  }
  if (kind === 'drawer') {
    const drawer = findItem(design, kind, id);
    return [
      cmField({ label: t('edHeightFromBase'), mm: drawer.y, testId: 'drawer-y', onCommit: move('modify_drawer', 'y') }),
      cmField({ label: t('edDrawerHeight'), mm: drawer.height, testId: 'drawer-height', onCommit: move('modify_drawer', 'height') }),
      ...overrideControls({ catalog, design, item: drawer, inherited: design.carcass.appearance, run: runAction, label: t('edDrawerFront'), inheritedFrom: 'carcass' }),
    ];
  }
  if (kind === 'rail') {
    const rail = findItem(design, kind, id);
    return [cmField({ label: t('edHeightFromBase'), mm: rail.y, testId: 'rail-y', onCommit: move('modify_rail', 'y') })];
  }
  if (kind === 'compartment') {
    const compartment = design.compartments.find((c) => c.id === id);
    return [
      cmField({ label: t('edWidth'), mm: compartment.width, testId: 'compartment-width', onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: id, width: mm }]) }),
      el('div', { className: 'button-row' }, ['shelf', 'drawer', 'rail'].map((item) =>
        button(t({ shelf: 'edAddShelf', drawer: 'edAddDrawer', rail: 'edAddRail' }[item]), () => runAction(addItemOps(design, id, item)), { testId: `add-${item}` }))),
    ];
  }
  if (kind === 'partition') {
    const index = design.partitions.findIndex((p) => p.id === id);
    return [
      cmField({ label: t('edPositionFromLeft'), mm: partitionLeftEdge(design, index), testId: 'partition-position', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, position: mm }]) }),
      cmField({ label: t('edThickness'), mm: design.partitions[index].thickness, testId: 'partition-thickness', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, thickness: mm }]) }),
    ];
  }
  if (kind === 'door') {
    const door = design.doors.items.find((d) => d.id === id);
    return [
      ...(design.doors.type === 'hinged' ? [segmented({
        label: t('edHingeSide'), value: door.hingeSide, testId: 'hinge-side',
        options: [{ value: 'left', label: t('edLeft') }, { value: 'right', label: t('edRight') }],
        onChange: (side) => runAction(doorHingeOps(design, id, side)),
      })] : []),
      segmented({
        label: t('edFront'), value: door.front, testId: 'door-front',
        options: [{ value: 'panel', label: t('edFrontPanel') }, { value: 'mirror', label: t('edFrontMirror') }],
        onChange: (front) => runAction(doorFrontOps(id, front)),
      }),
      ...overrideControls({ catalog, design, item: door, inherited: design.doors.appearance, run: runAction, label: t('edDoorFinish'), inheritedFrom: 'door' }),
    ];
  }
  return [el('p', { className: 'panel__note', text: t('edCarcassNote') })];
}

export function componentSection({ design, catalog, selection, run, select }) {
  const container = section(`${t('edSelected')} · ${title(selection.kind)}`, []);
  container.dataset.testid = 'selected-section';
  // Inputs report their own errors inline; buttons/selects report under the section.
  const runAction = (ops) => actionResult(container, run(ops));
  container.append(...fieldsFor(selection.kind, { design, catalog, selection, run, runAction }));
  const actions = [button(t('edDeselect'), () => select(null), { variant: 'ghost' })];
  if (selection.kind !== 'carcass') {
    actions.unshift(button(tf('edDelete', { kind: title(selection.kind).toLowerCase() }), () => runAction(removeOps(selection.id)), { variant: 'danger', testId: 'delete-selected' }));
  }
  container.append(el('div', { className: 'button-row' }, actions));
  return container;
}
