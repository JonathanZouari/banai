// Properties of the selected component; only the fields that apply to its kind.
import { appearanceControls } from './appearanceControls.js';
import { doorShelvesSection } from './doorShelvesSection.js';
import { actionResult, button, cmField, el, section, segmented } from './fields.js';
import {
  DOOR_SHELF_DEPTHS, addItemOps, clearAppearanceOps, doorHingeOps, doorShelfDepthRange, removeOps, toCmText,
} from './opsFromForm.js';
import { partitionLeftEdge } from '../domain/geometry.js';
import { doorShelfSetbacks } from '../viewer/doorShelfSetback.js';

const TITLES = Object.freeze({
  shelf: 'Shelf', drawer: 'Drawer', rail: 'Hanging rail', compartment: 'Compartment', partition: 'Partition', door: 'Door', doorShelf: 'Door shelf', carcass: 'Wardrobe body',
});

function findItem(design, kind, id) {
  const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails' }[kind];
  for (const compartment of design.compartments) {
    const item = compartment[key]?.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return null;
}

function overrideControls({ catalog, design, item, inherited, run, label }) {
  const appearance = item.appearance ?? inherited;
  return [
    appearanceControls({ catalog, appearance, target: item.id, run, label }),
    ...(item.appearance ? [button(`Use ${label.startsWith('Door') ? 'door' : 'carcass'} finish`, () => run(clearAppearanceOps(item.id)), { variant: 'ghost' })] : []),
  ];
}

function setbackNote(design, compartmentId) {
  const setback = doorShelfSetbacks(design)[design.compartments.findIndex((c) => c.id === compartmentId)];
  if (!setback) return [];
  return [el('p', { className: 'panel__note', text: `Shelves and drawers here are drawn ${toCmText(setback)} cm back from the front, to clear the door shelves (illustrative).` })];
}

function doorShelfFields({ design, catalog, id, run, runAction, select }) {
  const index = design.doors.items.findIndex((d) => d.shelves.some((s) => s.id === id));
  const door = design.doors.items[index];
  const shelf = door.shelves.find((s) => s.id === id);
  const number = [...door.shelves].sort((a, b) => a.y - b.y).findIndex((s) => s.id === id) + 1;
  const [low, high] = doorShelfDepthRange();
  const depthChoices = segmented({
    label: 'Depth', value: shelf.depth, testId: 'door-shelf-depth-choice',
    options: DOOR_SHELF_DEPTHS.map((mm) => ({ value: mm, label: `${mm / 10} cm` })),
    onChange: (mm) => runAction([{ op: 'modify_door_shelf', id, depth: mm }]),
  });
  return [
    el('nav', { className: 'breadcrumb', attrs: { 'aria-label': 'Door shelf location' } }, [
      button(`‹ Door ${index + 1}`, () => select(door.id), { variant: 'link', testId: 'door-shelf-parent' }),
      el('span', { text: `Shelf ${number}` }),
    ]),
    cmField({ label: 'Height from base', mm: shelf.y, testId: 'door-shelf-y', onCommit: (mm) => run([{ op: 'modify_door_shelf', id, y: mm }]) }),
    depthChoices,
    cmField({ label: 'Custom depth', mm: shelf.depth, testId: 'door-shelf-depth', onCommit: (mm) => run([{ op: 'modify_door_shelf', id, depth: mm }]) }),
    el('p', { className: 'field__hint', text: `Depth ${toCmText(low)}–${toCmText(high)} cm. It sits on the inside face of the door.` }),
    ...overrideControls({ catalog, design, item: shelf, inherited: door.appearance ?? design.doors.appearance, run: runAction, label: 'Door shelf finish' }),
  ];
}

function fieldsFor(kind, { design, catalog, selection, run, runAction, select }) {
  const { id } = selection;
  const move = (op, field) => (mm) => run([{ op, id, [field]: mm }]);
  if (kind === 'shelf') {
    const shelf = findItem(design, kind, id);
    return [
      cmField({ label: 'Height from base', mm: shelf.y, testId: 'shelf-y', onCommit: move('modify_shelf', 'y') }),
      cmField({ label: 'Thickness', mm: shelf.thickness, testId: 'shelf-thickness', onCommit: move('modify_shelf', 'thickness') }),
      ...overrideControls({ catalog, design, item: shelf, inherited: design.carcass.appearance, run: runAction, label: 'Shelf finish' }),
    ];
  }
  if (kind === 'drawer') {
    const drawer = findItem(design, kind, id);
    return [
      cmField({ label: 'Height from base', mm: drawer.y, testId: 'drawer-y', onCommit: move('modify_drawer', 'y') }),
      cmField({ label: 'Drawer height', mm: drawer.height, testId: 'drawer-height', onCommit: move('modify_drawer', 'height') }),
      ...overrideControls({ catalog, design, item: drawer, inherited: design.carcass.appearance, run: runAction, label: 'Drawer front' }),
    ];
  }
  if (kind === 'rail') {
    const rail = findItem(design, kind, id);
    return [cmField({ label: 'Height from base', mm: rail.y, testId: 'rail-y', onCommit: move('modify_rail', 'y') })];
  }
  if (kind === 'compartment') {
    const compartment = design.compartments.find((c) => c.id === id);
    return [
      cmField({ label: 'Width', mm: compartment.width, testId: 'compartment-width', onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: id, width: mm }]) }),
      el('div', { className: 'button-row' }, ['shelf', 'drawer', 'rail'].map((item) =>
        button(`+ ${item === 'rail' ? 'Rail' : item[0].toUpperCase() + item.slice(1)}`, () => runAction(addItemOps(design, id, item)), { testId: `add-${item}` }))),
      ...setbackNote(design, id),
    ];
  }
  if (kind === 'partition') {
    const index = design.partitions.findIndex((p) => p.id === id);
    return [
      cmField({ label: 'Position from left', mm: partitionLeftEdge(design, index), testId: 'partition-position', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, position: mm }]) }),
      cmField({ label: 'Thickness', mm: design.partitions[index].thickness, testId: 'partition-thickness', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, thickness: mm }]) }),
    ];
  }
  if (kind === 'door') {
    const door = design.doors.items.find((d) => d.id === id);
    return [
      ...(design.doors.type === 'hinged' ? [segmented({
        label: 'Hinge side', value: door.hingeSide, testId: 'hinge-side',
        options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
        onChange: (side) => runAction(doorHingeOps(design, id, side)),
      })] : []),
      doorShelvesSection({ design, door, selection, select, runAction }),
      ...overrideControls({ catalog, design, item: door, inherited: design.doors.appearance, run: runAction, label: 'Door finish' }),
    ];
  }
  if (kind === 'doorShelf') return doorShelfFields({ design, catalog, id, run, runAction, select });
  return [el('p', { className: 'panel__note', text: 'Edit the overall dimensions and materials in the Wardrobe section.' })];
}

export function componentSection({ design, catalog, selection, run, select }) {
  const container = section(`Selected · ${TITLES[selection.kind]}`, []);
  container.dataset.testid = 'selected-section';
  // Inputs report their own errors inline; buttons/selects report under the section.
  const runAction = (ops) => actionResult(container, run(ops));
  container.append(...fieldsFor(selection.kind, { design, catalog, selection, run, runAction, select }));
  const actions = [button('Deselect', () => select(null), { variant: 'ghost' })];
  if (selection.kind !== 'carcass') {
    actions.unshift(button(`Delete ${TITLES[selection.kind].toLowerCase()}`, () => runAction(removeOps(selection.id)), { variant: 'danger', testId: 'delete-selected' }));
  }
  container.append(el('div', { className: 'button-row' }, actions));
  return container;
}
