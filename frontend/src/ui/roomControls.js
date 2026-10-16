// "Room" popover on the 3D stage: wall colour and floor type of the decorative room.
// A viewer preference, not part of the wardrobe design: it is not an edit, not in undo
// history and not saved with the design. Remembered per browser (localStorage).
import { el } from '../editor/fields.js';
import { FLOOR_TYPES, WALL_COLORS, isFloorType, isHex } from '../viewer/room.js';
import { icon } from './icons.js';

const STORAGE_KEY = 'banai.room';

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return {
      ...(isHex(saved?.wall) ? { wall: saved.wall } : {}),
      ...(isFloorType(saved?.floor) ? { floor: saved.floor } : {}),
    };
  } catch {
    return {};
  }
}

function save(room) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(room));
  } catch {
    // Storage unavailable: the choice simply resets on reload.
  }
}

export function mountRoomControls(root, store) {
  store.setRoom(readSaved());

  const button = el('button', { className: 'btn btn--secondary', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', 'aria-label': 'Room', 'data-testid': 'room-button' } }, [
    icon('room', { size: 16 }), el('span', { className: 'btn__label', text: 'Room' }),
  ]);
  const panel = el('div', { className: 'room-panel', attrs: { role: 'dialog', 'aria-label': 'Room style', 'data-testid': 'room-panel' } });
  panel.hidden = true;
  root.prepend(el('div', { className: 'room-control' }, [button, panel]));

  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !root.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });

  const update = (patch) => {
    store.setRoom(patch);
    save(store.getState().ui.room);
  };

  const render = (room) => {
    const walls = WALL_COLORS.map((color) => {
      const swatch = el('button', { className: 'swatch', attrs: { type: 'button', title: color.name, 'aria-label': `${color.name} walls`, 'aria-pressed': String(room.wall === color.hex) } });
      swatch.style.backgroundColor = color.hex;
      swatch.addEventListener('click', () => update({ wall: color.hex }));
      return swatch;
    });
    const custom = el('input', { className: 'colour-input', attrs: { type: 'color', 'aria-label': 'Custom wall colour', title: 'Custom wall colour', 'data-testid': 'room-wall-custom' } });
    custom.value = room.wall;
    custom.addEventListener('change', () => update({ wall: custom.value }));
    const floors = FLOOR_TYPES.map((type) => {
      const chip = el('span', { className: 'floor-option__swatch', attrs: { 'aria-hidden': 'true' } });
      chip.style.backgroundColor = type.swatch;
      const option = el('button', { className: 'floor-option', attrs: { type: 'button', 'aria-pressed': String(room.floor === type.id), 'data-testid': `floor-${type.id}` } }, [chip, el('span', { text: type.name })]);
      option.addEventListener('click', () => update({ floor: type.id }));
      return option;
    });
    panel.replaceChildren(
      el('p', { className: 'room-panel__title', text: 'Room style' }),
      el('p', { className: 'room-panel__label', text: 'Wall colour' }),
      el('div', { className: 'swatches' }, [...walls, custom]),
      el('p', { className: 'room-panel__label', text: 'Floor' }),
      el('div', { className: 'floor-options' }, floors),
      el('p', { className: 'room-panel__note', text: 'For visualisation only. Not part of the wardrobe design.' }),
    );
  };

  let shown;
  store.subscribe((state) => {
    if (state.ui.room !== shown) {
      shown = state.ui.room;
      render(shown);
    }
  });
  shown = store.getState().ui.room;
  render(shown);
}
