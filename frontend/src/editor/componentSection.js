// Properties of the selected component; only the fields that apply to its kind.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, button, cmField, el, section, segmented, switchField } from './fields.js';
import { handleControls } from './handleControls.js';
import { compartmentInterior, insertFields } from './interiorControls.js';
import { insertLabel } from './interiorOps.js';
import { addItemOps, clearAppearanceOps, doorMirrorOps, modifyDoorOps, removeOps } from './opsFromForm.js';
import { describeSelection } from './selectionContext.js';
import { compartmentWidthRange, itemYRange } from './sliderRanges.js';
import { partitionLeftEdge } from '../domain/geometry.js';

const TITLES = Object.freeze({
  shelf: 'מדף', drawer: 'מגירה', rail: 'מוט תלייה', insert: 'רכיב', compartment: 'תא', partition: 'מחיצה', door: 'דלת', carcass: 'גוף הארון',
});

function findItem(design, kind, id) {
  const key = { shelf: 'shelves', drawer: 'drawers', rail: 'rails', insert: 'inserts' }[kind];
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
    ...(item.appearance ? [button(label === 'גימור הדלת' ? 'חזרה לגימור הדלתות' : 'חזרה לגימור הגוף', () => run(clearAppearanceOps(item.id)), { variant: 'ghost' })] : []),
  ];
}

// The handle block of a door or drawer: its own style/finish, or the wardrobe's while it has none.
function handleOverride({ design, item, kind, run }) {
  return handleControls({
    label: kind === 'door' ? 'ידית הדלת' : 'ידית המגירה',
    testPrefix: `${kind}-handle`,
    target: item.id,
    inherited: design.handles,
    override: item.handle ?? null,
    run,
  });
}

function fieldsFor(kind, { design, catalog, selection, run, runAction, report }) {
  const { id } = selection;
  const move = (op, field) => (mm) => run([{ op, id, [field]: mm }]);
  if (kind === 'shelf') {
    const shelf = findItem(design, kind, id);
    return [
      cmField({ label: 'גובה מהבסיס', mm: shelf.y, testId: 'shelf-y', onCommit: move('modify_shelf', 'y'), range: itemYRange(design, kind, shelf) }),
      cmField({ label: 'עובי', mm: shelf.thickness, testId: 'shelf-thickness', onCommit: move('modify_shelf', 'thickness') }),
      ...overrideControls({ catalog, design, item: shelf, inherited: design.carcass.appearance, run: runAction, label: 'גימור המדף' }),
    ];
  }
  if (kind === 'drawer') {
    const drawer = findItem(design, kind, id);
    return [
      cmField({ label: 'גובה מהבסיס', mm: drawer.y, testId: 'drawer-y', onCommit: move('modify_drawer', 'y'), range: itemYRange(design, kind, drawer) }),
      cmField({ label: 'גובה המגירה', mm: drawer.height, testId: 'drawer-height', onCommit: move('modify_drawer', 'height') }),
      ...overrideControls({ catalog, design, item: drawer, inherited: design.carcass.appearance, run: runAction, label: 'חזית המגירה' }),
      handleOverride({ design, item: drawer, kind, run: runAction }),
    ];
  }
  if (kind === 'rail') {
    const rail = findItem(design, kind, id);
    return [cmField({ label: 'גובה מהבסיס', mm: rail.y, testId: 'rail-y', onCommit: move('modify_rail', 'y'), range: itemYRange(design, kind, rail) })];
  }
  if (kind === 'compartment') {
    const compartment = design.compartments.find((c) => c.id === id);
    return [
      cmField({
        label: 'רוחב', mm: compartment.width, testId: 'compartment-width', range: compartmentWidthRange(design, id),
        onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: id, width: mm }]),
      }),
      el('div', { className: 'button-row' }, ['shelf', 'drawer', 'rail'].map((item) =>
        button(`+ ${{ shelf: 'מדף', drawer: 'מגירה', rail: 'מוט' }[item]}`, () => runAction(addItemOps(design, id, item)), { testId: `add-${item}` }))),
      ...compartmentInterior({ design, compartment, run, runAction, report }),
    ];
  }
  if (kind === 'insert') {
    return insertFields({ insert: findItem(design, kind, id), run });
  }
  if (kind === 'partition') {
    const index = design.partitions.findIndex((p) => p.id === id);
    return [
      cmField({ label: 'מיקום משמאל', mm: partitionLeftEdge(design, index), testId: 'partition-position', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, position: mm }]) }),
      cmField({ label: 'עובי', mm: design.partitions[index].thickness, testId: 'partition-thickness', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: id, thickness: mm }]) }),
    ];
  }
  if (kind === 'door') {
    const door = design.doors.items.find((d) => d.id === id);
    return [
      ...(design.doors.type === 'hinged' ? [segmented({
        label: 'צד הציר', value: door.hingeSide, testId: 'hinge-side',
        options: [{ value: 'left', label: 'שמאל' }, { value: 'right', label: 'ימין' }],
        onChange: (side) => runAction(modifyDoorOps(id, { hingeSide: side })),
      })] : []),
      switchField({
        label: 'חזית מראה', checked: door.mirror === true, testId: 'door-mirror',
        onChange: (mirror) => runAction(doorMirrorOps(id, mirror)),
      }),
      ...overrideControls({ catalog, design, item: door, inherited: design.doors.appearance, run: runAction, label: 'גימור הדלת' }),
      handleOverride({ design, item: door, kind, run: runAction }),
    ];
  }
  return [el('p', { className: 'panel__note', text: 'את המידות והחומרים של הארון כולו עורכים בחלק "ארון".' })];
}

export function componentSection({ design, catalog, selection, run, select }) {
  // The context line ("Compartment 1 · Shelf 2 of 4") sits directly under the title.
  const { text: where } = describeSelection(design, selection);
  const title = selection.kind === 'insert' ? insertLabel(findItem(design, 'insert', selection.id)?.type) : TITLES[selection.kind];
  const container = section(`נבחר · ${title}`, where ? [el('p', { className: 'prop-section__context', text: where })] : []);
  container.dataset.testid = 'selected-section';
  // Inputs report their own errors inline; buttons/selects report under the section.
  const report = (result) => actionResult(container, result);
  const runAction = (ops) => report(run(ops));
  container.append(...fieldsFor(selection.kind, { design, catalog, selection, run, runAction, report }));
  const actions = [button('ביטול בחירה', () => select(null), { variant: 'ghost' })];
  if (selection.kind !== 'carcass') {
    actions.unshift(button(`מחיקת ${title}`, () => runAction(removeOps(selection.id)), { variant: 'danger', testId: 'delete-selected' }));
  }
  container.append(el('div', { className: 'button-row' }, actions));
  return container;
}
