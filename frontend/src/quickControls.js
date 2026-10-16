// Quick viewer controls (bottom-right of the 3D view): open doors, clothes, mirror doors,
// Studio/Room backdrop and wardrobe handles. Every change goes through the store, and all
// text is set with textContent. Also maps the on-canvas dimension steppers to domain ops.

const HANDLE_STYLES = [['bar', 'Bar'], ['knob', 'Knob'], ['edge', 'Edge'], ['cup', 'Cup'], ['groove', 'Groove'], ['none', 'None']];
const HANDLE_FINISHES = [['steel', 'Steel'], ['black', 'Black'], ['brass', 'Brass']];
const ITEM_OPS = Object.freeze({ shelves: 'modify_shelf', drawers: 'modify_drawer', rails: 'modify_rail' });

function node(tag, { className, text, attrs = {} } = {}, children = []) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
  element.append(...children);
  return element;
}

function switchControl(label, testId, checked, onChange) {
  const input = node('input', { attrs: { type: 'checkbox', 'data-testid': testId } });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return { input, element: node('label', { className: 'switch' }, [input, node('span', { text: label })]) };
}

function selectControl(label, testId, options, value, onChange) {
  const select = node('select', { className: 'field__input', attrs: { 'aria-label': label, 'data-testid': testId } },
    options.map(([optionValue, optionLabel]) => node('option', { text: optionLabel, attrs: { value: optionValue } })));
  select.value = value;
  Object.assign(select.style, { width: 'auto', height: '28px' });
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

export function bindQuickControls(store, viewer, container) {
  const status = node('p', { className: 'visually-hidden', attrs: { role: 'status', 'aria-live': 'polite' } });
  const report = (result) => { status.textContent = result.ok ? '' : 'That change could not be applied.'; };

  const open = switchControl('Open doors', 'toggle-doors-open', store.getState().ui.doorsOpen, (on) => store.setDoorsOpen(on));
  const clothes = switchControl('Clothes', 'toggle-clothes', store.getState().ui.showClothes, (on) => store.setShowClothes(on));
  const mirror = switchControl('Mirror doors', 'toggle-mirror', false, (on) => {
    const doors = store.getState().design.doors.items;
    if (doors.length) report(store.dispatch(doors.map((door) => ({ op: 'modify_door', id: door.id, mirror: on }))));
  });
  const backdrop = selectControl('Backdrop', 'backdrop', [['studio', 'Studio'], ['room', 'Room']], viewer.backdrop ?? 'studio',
    (name) => { if (typeof viewer.setBackdrop === 'function') viewer.setBackdrop(name); });
  const { handles } = store.getState().design;
  const style = selectControl('Handle style', 'handle-style', HANDLE_STYLES, handles?.style ?? 'bar',
    (value) => report(store.dispatch([{ op: 'set_handles', target: 'all', style: value }])));
  const finish = selectControl('Handle finish', 'handle-finish', HANDLE_FINISHES, handles?.finish ?? 'steel',
    (value) => report(store.dispatch([{ op: 'set_handles', target: 'all', finish: value }])));

  const bar = node('div', { className: 'viewer-toolbar viewer-toolbar--quick', attrs: { role: 'group', 'aria-label': 'Quick view options' } },
    [open.element, clothes.element, mirror.element, backdrop, style, finish, status]);
  Object.assign(bar.style, {
    top: 'auto', bottom: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '8px',
    flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 'calc(100% - 24px)',
  });
  container.append(bar);

  store.subscribe((state) => {
    open.input.checked = state.ui.doorsOpen;
    clothes.input.checked = state.ui.showClothes;
    const doors = state.design.doors.items;
    mirror.input.disabled = doors.length === 0;
    mirror.input.checked = doors.length > 0 && doors.every((door) => door.mirror);
    style.value = state.design.handles?.style ?? 'bar';
    finish.value = state.design.handles?.finish ?? 'steel';
  });
}

/** Map an on-canvas stepper click ({ target, field, deltaMm }) to a domain op. */
export function stepDimension(store, { target, field, deltaMm }) {
  const { design } = store.getState();
  if (target === 'wardrobe') {
    return store.dispatch([{ op: 'update_dimensions', [field]: design.dimensions[field] + deltaMm }]);
  }
  for (const compartment of design.compartments) {
    if (compartment.id === target && field === 'width') {
      return store.dispatch([{ op: 'modify_compartment', compartmentId: target, width: compartment.width + deltaMm }]);
    }
    for (const [list, op] of Object.entries(ITEM_OPS)) {
      const item = compartment[list].find((entry) => entry.id === target);
      if (item && field === 'y') return store.dispatch([{ op, id: target, y: item.y + deltaMm }]);
    }
  }
  return { ok: false };
}
