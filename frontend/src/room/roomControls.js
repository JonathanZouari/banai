// The room's controls: a prominent "View in a room" button in the top bar, a one-time hint that
// introduces it, and the Room panel over the 3D view. They only ever change the room setup
// (roomState), never the design. Text follows the chat language (he/en); all controls are native
// buttons and inputs, so they work by keyboard with the app's focus ring.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { minimumRoom, roomBox } from './layout.js';
import { placeFurniture, PRESET_IDS } from './placement.js';
import { ROOM_SIZE_LIMITS, WARDROBE_POSITIONS } from './roomState.js';
import { VIEW_IDS } from './views.js';
import { FLOOR_IDS, LIGHT_IDS, WALL_COLORS, WALL_IDS } from './look.js';

const toCm = (mm) => Math.round(mm / 10);

/** Wall colours as named swatches: the chosen one has a check mark and its name shown, never colour alone. */
function wallSwatches(s, current, onPick) {
  const group = el('div', { className: 'room-swatches', attrs: { role: 'group', 'aria-label': s.walls } });
  WALL_IDS.forEach((id) => {
    const swatch = el('button', { className: 'room-swatch', attrs: { type: 'button', 'aria-pressed': String(id === current), 'aria-label': s.wallNames[id], title: s.wallNames[id] } },
      id === current ? [icon('check', { size: 16 })] : []);
    swatch.style.setProperty('--swatch', WALL_COLORS[id]);
    swatch.dataset.value = id;
    swatch.addEventListener('click', () => onPick(id));
    group.append(swatch);
  });
  return [group, el('p', { className: 'room-panel__note room-panel__purpose', text: s.wallNames[current] })];
}

/** The door-swing aid on or off (a native checkbox: keyboard and screen readers for free). */
function swingToggle(s, on, onChange) {
  const input = el('input', { attrs: { type: 'checkbox', id: 'room-show-swing' } });
  input.checked = on;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'toggle room-check', attrs: { for: 'room-show-swing' } }, [input, el('span', { text: s.showSwing })]);
}

/** Pieces of the chosen style that have no room in this room size (said plainly, never a rule). */
function notFitting(design, room, s) {
  const { omitted } = placeFurniture(design, room, room.preset);
  if (!omitted.length) return [];
  const names = [...new Set(omitted)].map((kind) => s.furniture[kind]).join(', ');
  return [el('p', { className: 'room-panel__notice', text: s.notFit(names), attrs: { role: 'status' } })];
}

function segmented(name, options, current, onPick) {
  const group = el('div', { className: 'room-seg', attrs: { role: 'group', 'aria-label': name } });
  options.forEach(([value, label]) => {
    const option = el('button', { className: 'room-seg__option', text: label, attrs: { type: 'button', 'aria-pressed': String(value === current) } });
    option.dataset.value = value;
    option.addEventListener('click', () => onPick(value));
    group.append(option);
  });
  return group;
}

/**
 * buttonHost: where the "View in a room" button goes (top bar); viewerHost: the 3D view.
 * getDesign(): the committed design (read only: the room adapts to its size).
 * onView(view): frame a camera view (also when it is already the chosen one).
 * onInset({ left, right }): pixels of the view the open panel covers (the camera frames the rest).
 */
export function mountRoomControls({ buttonHost, viewerHost, roomState, language, getDesign, onView = () => {}, onInset = () => {} }) {
  const button = el('button', { className: 'btn btn--tonal room-button', attrs: { type: 'button' } });
  button.dataset.testid = 'room-toggle';
  button.addEventListener('click', () => {
    roomState.set({ enabled: !roomState.get().enabled, hintSeen: true });
    hint.hidden = true;
  });
  // The hint hangs under the button itself, so both sit in one anchor.
  const anchor = el('span', { className: 'room-anchor' }, [button]);
  buttonHost.prepend(anchor);

  const hint = el('aside', { className: 'room-hint', attrs: { 'aria-labelledby': 'room-hint-title' } });
  hint.dataset.testid = 'room-hint';
  hint.hidden = true;
  hint.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismissHint();
  });
  anchor.append(hint);

  const panel = el('section', { className: 'room-panel', attrs: { 'aria-labelledby': 'room-panel-title' } });
  panel.dataset.testid = 'room-panel';
  viewerHost.append(panel);
  let collapsed = false;

  function dismissHint(show = false) {
    hint.hidden = true;
    roomState.set({ hintSeen: true, ...(show && { enabled: true }) });
    if (show) panel.querySelector('button')?.focus();
  }

  function renderButton(t) {
    const on = roomState.get().enabled;
    button.replaceChildren(icon('room', { size: 20 }), el('span', { text: t.room.button }));
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('lang', language.get());
    button.classList.toggle('room-button--on', on);
  }

  function renderHint(t) {
    const show = el('button', { className: 'btn btn--primary', text: t.room.hintShow, attrs: { type: 'button' } });
    show.addEventListener('click', () => dismissHint(true));
    const later = el('button', { className: 'btn', text: t.room.hintDismiss, attrs: { type: 'button' } });
    later.addEventListener('click', () => dismissHint());
    hint.setAttribute('dir', t.dir);
    hint.setAttribute('lang', language.get());
    hint.replaceChildren(
      el('span', { className: 'room-hint__icon', attrs: { 'aria-hidden': 'true' } }, [icon('room', { size: 22 })]),
      el('div', { className: 'room-hint__body' }, [
        el('p', { className: 'room-hint__title', text: t.room.hintTitle, attrs: { id: 'room-hint-title' } }),
        el('p', { className: 'room-hint__text', text: t.room.hintText }),
        el('div', { className: 'button-row' }, [show, later]),
      ]),
    );
  }

  function sizeField(key, label, s, room, min) {
    const id = `room-size-${key}`;
    const input = el('input', {
      className: 'field__input room-size__input',
      attrs: { id, type: 'number', inputmode: 'numeric', min: String(Math.max(toCm(ROOM_SIZE_LIMITS[key][0]), toCm(min[key]))), max: String(toCm(ROOM_SIZE_LIMITS[key][1])), step: '1' },
    });
    input.value = String(toCm(room.size[key]));
    input.dataset.testid = id;
    const commit = () => {
      const cm = Number.parseInt(input.value, 10);
      if (!Number.isFinite(cm)) {
        input.value = String(toCm(room.size[key]));
        return;
      }
      const [lo, hi] = ROOM_SIZE_LIMITS[key];
      roomState.set({ size: { [key]: Math.min(Math.max(cm * 10, lo), hi) } });
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit();
    });
    return el('div', { className: 'room-size__field' }, [
      el('label', { text: label, attrs: { for: id } }),
      el('div', { className: 'room-size__box' }, [input, el('span', { className: 'room-size__unit', text: s.cm, attrs: { 'aria-hidden': 'true' } })]),
    ]);
  }

  function renderPanel(t) {
    const room = roomState.get();
    panel.hidden = !room.enabled;
    if (!room.enabled) return;
    const s = t.room;
    const design = getDesign();
    const box = roomBox(design, room);
    const min = minimumRoom(design);
    const toggle = el('button', {
      className: 'icon-btn room-panel__collapse',
      attrs: { type: 'button', 'aria-expanded': String(!collapsed), 'aria-controls': 'room-panel-body', 'aria-label': collapsed ? s.expand : s.collapse },
    }, [icon('chevron', { size: 20 })]);
    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      render();
      panel.querySelector('.room-panel__collapse').focus();
    });
    const body = el('div', { className: 'room-panel__body', attrs: { id: 'room-panel-body' } }, [
      el('p', { className: 'room-panel__note', text: s.note }),
      el('h3', { className: 'room-panel__section', text: s.size }),
      el('div', { className: 'room-size' }, [
        sizeField('width', s.width, s, room, min),
        sizeField('length', s.length, s, room, min),
        sizeField('height', s.ceiling, s, room, min),
      ]),
      ...(box.clamped.length ? [el('p', { className: 'room-panel__notice', text: s.clamped, attrs: { role: 'status' } })] : []),
      el('h3', { className: 'room-panel__section', text: s.wardrobeAt }),
      segmented(s.wardrobeAt, WARDROBE_POSITIONS.map((p) => [p, s.positions[p]]), room.wardrobeAt, (value) => roomState.set({ wardrobeAt: value })),
      el('h3', { className: 'room-panel__section', text: s.style }),
      segmented(s.style, PRESET_IDS.map((p) => [p, s.presets[p]]), room.preset, (value) => roomState.set({ preset: value })),
      ...notFitting(design, room, s),
      el('h3', { className: 'room-panel__section', text: s.walls }),
      ...wallSwatches(s, room.wall, (value) => roomState.set({ wall: value })),
      el('h3', { className: 'room-panel__section', text: s.floor }),
      segmented(s.floor, FLOOR_IDS.map((f) => [f, s.floors[f]]), room.floor, (value) => roomState.set({ floor: value })),
      el('h3', { className: 'room-panel__section', text: s.light }),
      segmented(s.light, LIGHT_IDS.map((l) => [l, s.lights[l]]), room.light, (value) => roomState.set({ light: value })),
      swingToggle(s, room.showSwing, (value) => roomState.set({ showSwing: value })),
      el('h3', { className: 'room-panel__section', text: s.view }),
      segmented(s.view, VIEW_IDS.map((v) => [v, s.views[v]]), room.view, (value) => onView(value)),
      el('p', { className: 'room-panel__note room-panel__purpose', text: s.viewPurpose[room.view] }),
    ]);
    body.hidden = collapsed;
    panel.setAttribute('dir', t.dir);
    panel.setAttribute('lang', language.get());
    panel.classList.toggle('room-panel--collapsed', collapsed);
    panel.replaceChildren(
      el('header', { className: 'room-panel__header' }, [
        icon('room', { size: 20 }),
        el('h2', { className: 'room-panel__title', text: s.panel, attrs: { id: 'room-panel-title' } }),
        toggle,
      ]),
      body,
    );
  }

  function render() {
    renderNow();
    reportInset();
  }

  function renderNow() {
    const t = language.strings();
    // Keep keyboard focus on the same control across a re-render.
    const active = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active && (active.id || (active.dataset.value && `${active.closest('[role=group]')?.getAttribute('aria-label')}|${active.dataset.value}`));
    renderButton(t);
    renderHint(t);
    renderPanel(t);
    if (focusKey) {
      const [group, value] = focusKey.split('|');
      const again = value
        ? [...panel.querySelectorAll(`[role=group] [data-value="${value}"]`)].find((b) => b.closest('[role=group]').getAttribute('aria-label') === group)
        : panel.querySelector(`#${CSS.escape(group)}`);
      again?.focus();
    }
  }

  // Tell the viewer how much of it the panel covers (a bottom sheet on a phone covers no side).
  const reportInset = () => {
    const covered = !panel.hidden && !collapsed && getComputedStyle(panel).position === 'absolute' && panel.offsetWidth < viewerHost.clientWidth * 0.6;
    const width = covered ? panel.offsetWidth + 12 : 0;
    const rtl = panel.getAttribute('dir') === 'rtl';
    onInset({ left: rtl ? width : 0, right: rtl ? 0 : width });
  };
  new ResizeObserver(reportInset).observe(viewerHost);
  roomState.subscribe(render);
  language.subscribe(render);
  render();

  return {
    /** Re-render (the design's size changed: limits and clamping follow it). */
    refresh: render,
    /** The first time the editor opens, introduce the room once (remembered per browser). */
    showHintIfNew() {
      const room = roomState.get();
      if (room.hintSeen || room.enabled) return;
      hint.hidden = false;
    },
  };
}
