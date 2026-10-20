// Two sections. Doors: everything about the doors themselves (type, sliding panel count, mirror fronts).
// Handles: one handle style and finish for every door. Handles are hidden when the wardrobe has no doors.
import { actionResult, countField, el, section, segmented } from './fields.js';
import { doorFrontOps, doorTypeOps, handleOps, slidingCountOps } from './opsFromForm.js';
import { icon } from '../ui/icons.js';
import { catalogName, t, tf } from '../i18n/strings.js';

const STYLE_ICONS = Object.freeze({
  bar: 'handleBar', long_bar: 'handleLongBar', knob: 'handleKnob', edge_pull: 'handleEdgePull', none: 'handleNone',
});

function handleStyles({ catalog, handles, run }) {
  const group = el('div', { className: 'handle-styles', attrs: { role: 'group', 'aria-label': t('edHandleStyle') } });
  group.dataset.testid = 'handle-style';
  catalog.handleStyles.forEach((style) => {
    const name = catalogName(style);
    const option = el('button', {
      className: 'handle-style',
      attrs: { type: 'button', 'aria-pressed': String(handles.style === style.id), title: name },
    }, [icon(STYLE_ICONS[style.id] ?? 'handleBar', { size: 26 }), el('span', { className: 'handle-style__name', text: name })]);
    option.dataset.testid = `handle-style-${style.id}`;
    option.addEventListener('click', () => { if (handles.style !== style.id) run(handleOps('style', style.id)); });
    group.append(option);
  });
  return el('div', { className: 'field' }, [el('span', { className: 'field__label', text: t('edHandleStyle') }), group]);
}

function handleFinishes({ catalog, handles, run }) {
  const off = handles.style === 'none';
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': t('edHandleFinish') } });
  catalog.handleFinishes.forEach((finish) => {
    const name = catalogName(finish);
    const chip = el('span', { className: 'swatch swatch--metal', attrs: { 'aria-hidden': 'true' } });
    chip.style.backgroundColor = finish.hex; // validated #rrggbb from the parsed catalog
    const option = el('button', {
      className: 'swatch-option',
      attrs: { type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(handles.finish === finish.id) },
    }, [chip, el('span', { className: 'swatch-option__name', text: name })]);
    option.dataset.testid = `handle-finish-${finish.id}`;
    option.disabled = off;
    option.addEventListener('click', () => run(handleOps('finish', finish.id)));
    row.append(option);
  });
  return [el('p', { className: 'field__label', text: t('edHandleFinish') }), row];
}

function mirrorFronts({ design, run }) {
  const row = el('div', { className: 'mirror-fronts', attrs: { role: 'group', 'aria-label': t('edMirrorFronts') } });
  row.dataset.testid = 'mirror-fronts';
  design.doors.items.forEach((door, index) => {
    const on = door.front === 'mirror';
    const label = tf('edDoorN', { n: index + 1 });
    const chip = el('button', {
      className: 'mirror-chip',
      attrs: { type: 'button', 'aria-pressed': String(on), 'aria-label': tf(on ? 'edMirrorOn' : 'edMirrorOff', { door: label }) },
    }, [...(on ? [icon('mirror', { size: 16 })] : []), el('span', { text: label })]);
    chip.dataset.testid = `mirror-${door.id}`;
    chip.addEventListener('click', () => run(doorFrontOps(door.id, on ? 'panel' : 'mirror')));
    row.append(chip);
  });
  return el('div', { className: 'field' }, [
    el('span', { className: 'field__label', text: t('edMirrorFronts') }),
    row,
    el('p', { className: 'panel__note', text: t('edMirrorNote') }),
  ]);
}

export function doorsSection({ design, run }) {
  const { doors } = design;
  const container = section(t('edDoors'), []);
  container.dataset.testid = 'doors-section';
  const runDoors = (ops) => actionResult(container, run(ops));
  container.append(segmented({
    label: t('edDoorType'),
    testId: 'door-type',
    value: doors.type,
    options: [{ value: 'hinged', label: t('edHinged') }, { value: 'sliding', label: t('edSliding') }, { value: 'none', label: t('edNone') }],
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    container.append(countField({
      label: t('edSlidingPanels'), value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(slidingCountOps(design, count)),
    }));
  }
  if (doors.type !== 'none') container.append(mirrorFronts({ design, run: runDoors }));
  return [container];
}

export function handlesSection({ design, catalog, run }) {
  if (design.doors.type === 'none') return [];
  const container = section(t('edHandles'), []);
  container.dataset.testid = 'handles-section';
  const runAction = (ops) => actionResult(container, run(ops));
  const { handles } = design.doors;
  container.append(
    handleStyles({ catalog, handles, run: runAction }),
    ...handleFinishes({ catalog, handles, run: runAction }),
  );
  return [container];
}
