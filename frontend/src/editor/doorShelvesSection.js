// "Shelves inside this door": the door's inside shelves as a to-scale drawing plus a list,
// "+ Door shelf", and quick layouts. Sliding doors show the section disabled, with the reason.
import { icon } from '../ui/icons.js';
import { doorElevation } from './doorElevation.js';
import { button, el } from './fields.js';
import { DOOR_SHELF_LAYOUTS, addDoorShelfOps, doorShelfLayoutOps, removeOps, toCmText } from './opsFromForm.js';

function header(count) {
  return el('div', { className: 'door-shelves__header' }, [
    el('h4', { className: 'door-shelves__title', text: 'Shelves inside this door' }),
    el('span', { className: 'badge', text: String(count), attrs: { 'aria-label': `${count} shelves` } }),
  ]);
}

function shelfRow(shelf, number, { selection, select, runAction }) {
  const label = `Shelf ${number} · ${toCmText(shelf.y)} cm · ${toCmText(shelf.depth)} cm deep`;
  const open = button(label, () => select(shelf.id), { variant: 'link', testId: `door-shelf-${shelf.id}` });
  if (selection?.id === shelf.id) open.setAttribute('aria-current', 'true');
  const remove = el('button', { className: 'icon-btn icon-btn--small', attrs: { type: 'button', 'aria-label': `Delete shelf ${number}` } }, [icon('close', { size: 16 })]);
  remove.dataset.testid = `delete-door-shelf-${shelf.id}`;
  remove.addEventListener('click', () => runAction(removeOps(shelf.id)));
  return el('li', { className: 'door-shelves__row' }, [open, remove]);
}

export function doorShelvesSection({ design, door, selection, select, runAction }) {
  const container = el('div', { className: 'door-shelves' });
  container.dataset.testid = 'door-shelves';
  if (design.doors.type !== 'hinged') {
    container.classList.add('is-disabled');
    container.append(
      header(0),
      el('p', { className: 'panel__note door-shelves__note' }, [
        icon('info', { size: 18 }),
        el('span', { text: 'Door shelves need hinged doors. Switch the door type to Hinged in the Wardrobe section.' }),
      ]),
      button('+ Door shelf', () => {}, { disabled: true }),
    );
    return container;
  }

  const sorted = [...door.shelves].sort((a, b) => a.y - b.y);
  const drawing = doorElevation({ design, door, selectedId: selection?.id, select });
  const body = sorted.length
    ? el('ol', { className: 'door-shelves__list' }, sorted.map((shelf, i) => shelfRow(shelf, i + 1, { selection, select, runAction })).reverse())
    : el('p', { className: 'door-shelves__empty', text: 'No shelves on this door yet. Add one or start from a quick layout.' });
  // The new shelf is selected straight away, which swings the doors open to show it.
  const add = button('+ Door shelf', () => {
    const ops = addDoorShelfOps(design, door.id);
    if (runAction(ops).ok) select(ops[0].id);
  }, { testId: 'add-door-shelf' });

  const chips = DOOR_SHELF_LAYOUTS.map((layout) => {
    const ops = doorShelfLayoutOps(design, door.id, layout.key);
    const chip = button(layout.label, () => runAction(ops), { variant: 'chip', testId: `door-layout-${layout.key}`, disabled: !ops });
    if (!ops) chip.title = 'Some of these heights already have a shelf on this door.';
    return chip;
  });

  container.append(
    header(sorted.length),
    el('div', { className: 'door-shelves__body' }, [drawing, body]),
    el('div', { className: 'button-row' }, [add]),
    el('div', { className: 'door-shelves__layouts' }, [
      el('span', { className: 'field__label', text: 'Quick layout' }),
      el('div', { className: 'chip-row' }, chips),
    ]),
  );
  return container;
}
