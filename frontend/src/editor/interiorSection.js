// Interior configuration: one card per compartment (left to right) listing its shelves, drawers and
// rails, with add buttons, quick layouts and per-item remove. Choosing a card or an item selects it
// in 3D (which also switches the view to the interior).
import { actionResult, button, el, section } from './fields.js';
import { addItemOps, LAYOUTS, layoutOps, removeOps } from './opsFromForm.js';
import { icon } from '../ui/icons.js';
import { compactLength, units } from '../ui/units.js';
import { t, tf } from '../i18n/strings.js';

const len = (mm) => `${compactLength(mm, units.get())} ${units.get()}`;
const ADD_KEYS = Object.freeze({ shelf: 'edAddShelf', drawer: 'edAddDrawer', rail: 'edAddRail' });
const LAYOUT_KEYS = Object.freeze({ hanging: 'edLayoutHanging', shelves: 'edLayoutShelves', drawers: 'edLayoutDrawers' });

/** Items bottom to top, each with its text and remove label. */
function itemsOf(compartment) {
  return [
    ...compartment.drawers.map((d) => ({ id: d.id, y: d.y, text: tf('edItemDrawer', { from: compactLength(d.y, units.get()), to: len(d.y + d.height) }), kind: 'edDrawer' })),
    ...compartment.shelves.map((s) => ({ id: s.id, y: s.y, text: tf('edItemShelf', { y: len(s.y) }), kind: 'edShelf' })),
    ...compartment.rails.map((r) => ({ id: r.id, y: r.y, text: tf('edItemRail', { y: len(r.y) }), kind: 'edRail' })),
  ].sort((a, b) => a.y - b.y);
}

function card({ design, selection, run, select }, compartment, index) {
  const items = itemsOf(compartment);
  const ownsSelection = selection && (selection.id === compartment.id || items.some((item) => item.id === selection.id));
  const node = el('li', { className: `interior-card${ownsSelection ? ' is-selected' : ''}` });
  if (ownsSelection) node.setAttribute('aria-current', 'true');
  node.dataset.testid = `interior-${compartment.id}`;
  const runAction = (ops) => actionResult(node, run(ops));

  const heading = el('button', { className: 'interior-card__title', attrs: { type: 'button' } }, [
    el('span', { text: `${t('edCompartment')} ${index + 1}` }),
    el('span', { className: 'interior-card__width', text: len(compartment.width) }),
  ]);
  heading.dataset.testid = `interior-select-${compartment.id}`;
  heading.addEventListener('click', () => select(compartment.id));

  const counts = el('p', { className: 'interior-card__counts', text: tf('edInteriorCounts', {
    shelves: compartment.shelves.length, drawers: compartment.drawers.length, rails: compartment.rails.length,
  }) });

  const list = el('ul', { className: 'interior-items' }, items.map((item) => {
    const selected = selection?.id === item.id;
    const label = el('button', { className: 'interior-item__label', text: item.text, attrs: { type: 'button', 'aria-pressed': String(selected) } });
    label.dataset.testid = `item-${item.id}`;
    label.addEventListener('click', () => select(item.id));
    const remove = el('button', { className: 'icon-btn interior-item__remove', attrs: { type: 'button', 'aria-label': tf('edRemoveItem', { item: item.text }), title: t('edRemove') } }, [icon('close', { size: 18 })]);
    remove.dataset.testid = `remove-item-${item.id}`;
    remove.addEventListener('click', () => runAction(removeOps(item.id)));
    return el('li', { className: `interior-item${selected ? ' is-selected' : ''}` }, [label, remove]);
  }));
  if (items.length === 0) list.append(el('li', { className: 'interior-items__empty', text: t('edInteriorEmpty') }));

  const add = el('div', { className: 'button-row' }, ['shelf', 'drawer', 'rail'].map((kind) =>
    button(t(ADD_KEYS[kind]), () => runAction(addItemOps(design, compartment.id, kind)), { variant: 'tonal', testId: `add-${kind}-${compartment.id}` })));

  const layouts = el('div', { className: 'interior-layouts', attrs: { role: 'group', 'aria-label': t('edQuickLayout') } }, [
    el('span', { className: 'interior-layouts__label', text: t('edQuickLayout') }),
    ...LAYOUTS.map((layout) => {
      const chip = button(t(LAYOUT_KEYS[layout]), () => runAction(layoutOps(design, compartment.id, layout)), { variant: 'chip', testId: `layout-${layout}-${compartment.id}` });
      chip.title = t(`${LAYOUT_KEYS[layout]}Hint`);
      return chip;
    }),
  ]);

  node.append(heading, counts, list, add, layouts);
  return node;
}

export function interiorSection(context) {
  const cards = el('ol', { className: 'interior-cards' }, context.design.compartments.map((compartment, index) => card(context, compartment, index)));
  const container = section(t('edInterior'), [el('p', { className: 'panel__hint', text: t('edInteriorHint') }), cards]);
  container.dataset.testid = 'interior-section';
  return container;
}
