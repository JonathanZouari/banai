// Contextual inspector content for the selected component: only the groups and quick
// actions that apply to its kind (Position · Dimensions · Appearance · Actions).
// Customer-facing names only (no internal ids). Every change is a domain op.
import { actionResult, button, cmField, el, readonlyField, section, segmented, selectField } from './fields.js';
import { addItemOps, clearAppearanceOps, doorHingeOps, duplicateOps, materialOps, removeOps, toCmText } from './opsFromForm.js';
import { interiorHeight, partitionLeftEdge } from '../domain/geometry.js';
import { labelOf, nameOf } from '../ui/naming.js';
import { cm } from '../viewer/format.js';
import { VISUAL } from '../viewer/units.js';

const ITEM_LISTS = Object.freeze({ shelf: 'shelves', drawer: 'drawers', rail: 'rails' });
const SLIDER_STEP_MM = 10;
const INHERIT = '__inherit';
const CUSTOM = '__custom';

function findItem(design, kind, id) {
  for (const compartment of design.compartments) {
    const item = compartment[ITEM_LISTS[kind]]?.find((candidate) => candidate.id === id);
    if (item) return { item, compartment };
  }
  return null;
}

/** Material / colour / finish selects for an item; "Same as …" means no override. */
function appearanceGroup({ catalog, item, inheritedLabel, run }) {
  const override = item.appearance;
  const select = (field, label, entries) => {
    const ref = override?.[field];
    const options = [
      ...(!override ? [{ value: INHERIT, label: `Same as ${inheritedLabel === 'wardrobe body' ? 'body' : inheritedLabel}` }] : []),
      ...(ref?.custom ? [{ value: CUSTOM, label: `Custom: ${ref.name}` }] : []),
      ...entries.map((entry) => ({ value: entry.id, label: entry.name })),
    ];
    return selectField({
      label,
      options,
      value: !override ? INHERIT : ref.custom ? CUSTOM : ref.catalogId,
      onChange: (value) => {
        if (value === INHERIT || value === CUSTOM) return;
        run(materialOps(item.id, field, { catalogId: value }));
      },
    });
  };
  return section('Appearance', [
    select('material', 'Material', catalog.materials),
    select('color', 'Colour', catalog.colors),
    select('finish', 'Finish', catalog.finishes),
    ...(override ? [button(`Use ${inheritedLabel} finish`, () => run(clearAppearanceOps(item.id)), { variant: 'ghost', testId: 'clear-finish' })] : []),
  ]);
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function itemList(design, compartment, select) {
  const items = [
    ...compartment.drawers.map((d) => ({ id: d.id, y: d.y })),
    ...compartment.shelves.map((s) => ({ id: s.id, y: s.y })),
    ...compartment.rails.map((r) => ({ id: r.id, y: r.y })),
  ].sort((a, b) => b.y - a.y);
  if (!items.length) return el('p', { className: 'panel__note', text: 'This section is empty.' });
  return el('ul', { className: 'item-list' }, items.map(({ id, y }) => {
    const row = el('button', { className: 'item-row', attrs: { type: 'button' } }, [
      el('span', { text: nameOf(design, id).title }),
      el('span', { className: 'item-row__meta', text: `${cm(y)} cm` }),
    ]);
    row.addEventListener('click', () => select(id));
    return el('li', {}, [row]);
  }));
}

function sectionContent({ design, selection, run, select, runAction }) {
  const compartment = design.compartments.find((c) => c.id === selection.id);
  const size = section('Dimensions', [
    cmField({ label: 'Width', mm: compartment.width, testId: 'compartment-width', onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: compartment.id, width: mm }]) }),
    readonlyField({ label: 'Height (inside)', text: cm(interiorHeight(design)) }),
  ]);
  const contents = section('Contents', [
    el('p', { className: 'stat-line', text: [
      plural(compartment.shelves.length, 'shelf', 'shelves'),
      plural(compartment.drawers.length, 'drawer', 'drawers'),
      plural(compartment.rails.length, 'hanging rail', 'hanging rails'),
    ].join(' · ') }),
    el('div', { className: 'quick-actions' }, [
      button('+ Shelf', () => runAction(addItemOps(design, compartment.id, 'shelf')), { testId: 'add-shelf', variant: 'secondary' }),
      button('+ Drawer', () => runAction(addItemOps(design, compartment.id, 'drawer')), { testId: 'add-drawer', variant: 'secondary' }),
      button('+ Hanging rail', () => runAction(addItemOps(design, compartment.id, 'rail')), { testId: 'add-rail', variant: 'secondary' }),
    ]),
    itemList(design, compartment, select),
  ]);
  return { groups: [size, contents], canDelete: design.compartments.length > 1, deleteLabel: 'Delete section' };
}

/** Height-from-base field plus a slider that commits on release (never per pixel). */
function positionGroup({ design, kind, item, runAction, run }) {
  const op = { shelf: 'modify_shelf', drawer: 'modify_drawer', rail: 'modify_rail' }[kind];
  const field = cmField({ label: 'Height from bottom', mm: item.y, testId: `${kind}-y`, onCommit: (mm) => run([{ op, id: item.id, y: mm }]) });
  const span = kind === 'shelf' ? item.thickness : kind === 'drawer' ? item.height : 0;
  const max = Math.max(0, interiorHeight(design) - span);
  const slider = el('input', { className: 'slider', attrs: { type: 'range', min: '0', max: String(max), step: String(SLIDER_STEP_MM), 'aria-label': 'Height from bottom', 'data-testid': `${kind}-slider` } });
  slider.value = String(item.y);
  slider.addEventListener('input', () => {
    field.input.value = toCmText(Number(slider.value));
  });
  slider.addEventListener('change', () => {
    const result = runAction([{ op, id: item.id, y: Number(slider.value) }]);
    if (!result.ok) {
      slider.value = String(item.y);
      field.input.value = toCmText(item.y);
    }
  });
  return section('Position', [field, slider]);
}

function itemContent(kind, context) {
  const { design, catalog, selection, run, runAction } = context;
  const { item, compartment } = findItem(design, kind, selection.id);
  const groups = [positionGroup({ design, kind, item, runAction, run })];
  const depth = design.dimensions.depth - VISUAL.backThickness;
  const dims = [
    readonlyField({ label: 'Width', text: cm(compartment.width) }),
    readonlyField({ label: 'Depth', text: cm(depth) }),
  ];
  if (kind === 'shelf') {
    dims.push(cmField({ label: 'Thickness', mm: item.thickness, testId: 'shelf-thickness', onCommit: (mm) => run([{ op: 'modify_shelf', id: item.id, thickness: mm }]) }));
  } else if (kind === 'drawer') {
    dims.push(cmField({ label: 'Drawer height', mm: item.height, testId: 'drawer-height', onCommit: (mm) => run([{ op: 'modify_drawer', id: item.id, height: mm }]) }));
  }
  groups.push(section('Dimensions', dims));
  if (kind !== 'rail') {
    groups.push(appearanceGroup({ catalog, item, inheritedLabel: 'wardrobe body', run: runAction }));
  }
  return { groups, canDelete: true, deleteLabel: 'Delete', duplicate: true };
}

function dividerContent({ design, selection, run }) {
  const index = design.partitions.findIndex((p) => p.id === selection.id);
  return {
    groups: [section('Position', [
      cmField({ label: 'Position from left', mm: partitionLeftEdge(design, index), testId: 'partition-position', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: selection.id, position: mm }]) }),
      cmField({ label: 'Thickness', mm: design.partitions[index].thickness, testId: 'partition-thickness', onCommit: (mm) => run([{ op: 'modify_partition', partitionId: selection.id, thickness: mm }]) }),
      el('p', { className: 'readout', text: `Between ${labelOf(design, design.compartments[index].id)} and ${labelOf(design, design.compartments[index + 1].id)}` }),
    ])],
    canDelete: true,
    deleteLabel: 'Remove divider',
    deleteNote: 'Removing a divider merges the two sections.',
  };
}

/** "Door front: Panel | Mirror" — a mirror is the catalog material `mirror` on this door. */
function doorFront(design, door, runAction) {
  const effective = (door.appearance ?? design.doors.appearance).material;
  const mirrored = !effective.custom && effective.catalogId === 'mirror';
  const shared = design.doors.appearance.material;
  const panelMaterial = !shared.custom && shared.catalogId !== 'mirror' ? shared : { catalogId: 'melamine' };
  return segmented({
    label: 'Door front', value: mirrored ? 'mirror' : 'panel', testId: 'door-front',
    options: [{ value: 'panel', label: 'Panel' }, { value: 'mirror', label: 'Mirror' }],
    onChange: (value) => runAction(materialOps(door.id, 'material', value === 'mirror' ? { catalogId: 'mirror' } : panelMaterial)),
  });
}

function doorContent({ design, catalog, selection, runAction }) {
  const door = design.doors.items.find((d) => d.id === selection.id);
  const groups = [section('Front', [doorFront(design, door, runAction)])];
  if (design.doors.type === 'hinged') {
    groups.push(section('Opening', [segmented({
      label: 'Hinge side', value: door.hingeSide, testId: 'hinge-side',
      options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
      onChange: (side) => runAction(doorHingeOps(design, door.id, side)),
    })]));
  }
  groups.push(appearanceGroup({ catalog, item: door, inheritedLabel: 'doors', run: runAction }));
  return { groups, canDelete: true, deleteLabel: 'Delete door' };
}

export function componentSection(context) {
  const { design, selection, run } = context;
  const container = el('div', { className: 'inspector', attrs: { 'data-testid': 'selected-section', 'data-kind': selection.kind } });
  // Inputs report their own errors inline; buttons/selects/sliders report under the inspector.
  const runAction = (ops) => actionResult(container, run(ops));
  const full = { ...context, runAction };
  const { kind } = selection;
  const content = kind === 'compartment' ? sectionContent(full)
    : ITEM_LISTS[kind] ? itemContent(kind, full)
      : kind === 'partition' ? dividerContent(full)
        : doorContent(full);
  container.append(...content.groups);
  const actions = [];
  if (content.duplicate) {
    actions.push(button('Duplicate', () => {
      const ops = duplicateOps(design, selection.id);
      if (!ops) {
        actionResult(container, { ok: false, error: { code: 'NO_ROOM' } });
        return;
      }
      const result = runAction(ops);
      if (result.ok) context.select(ops[0].id);
    }, { testId: 'duplicate-selected' }));
  }
  actions.push(button(content.deleteLabel, () => runAction(removeOps(selection.id)), { variant: 'danger', testId: 'delete-selected', disabled: !content.canDelete }));
  container.append(section('Actions', [
    ...(content.deleteNote ? [el('p', { className: 'panel__note', text: content.deleteNote })] : []),
    el('div', { className: actions.length === 2 ? 'action-row' : 'button-row' }, actions),
  ]));
  return [container];
}

