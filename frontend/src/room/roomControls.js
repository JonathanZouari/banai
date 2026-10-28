// The room's controls: a prominent "View in a room" button in the top bar, a one-time hint that
// introduces it, and the Room panel over the 3D view. They only ever change the room setup
// (roomState), never the design. Text follows the chat language (he/en); all controls are native
// buttons and inputs, so they work by keyboard with the app's focus ring.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { roomBox } from './layout.js';
import { placeFurniture, PRESET_IDS } from './placement.js';
import { ROOM_SIZE_LIMITS, WARDROBE_POSITIONS } from './roomState.js';
import { VIEW_IDS } from './views.js';
import { FLOOR_IDS, LIGHT_IDS, WALL_COLORS, WALL_IDS } from './look.js';
import { STRINGS } from '../chat/i18n.js';
import { DEFAULT_UNIT, formatLength, parseLength } from '../units/displayUnits.js';

/** A room size as shown in the display unit: '400', '4000', '157.48' (no trailing '.0'). */
const shownLength = (mm, unit) => formatLength(mm, unit).replace(/\.0+$/, '');

/** Typed room size in the display unit -> integer mm within the room limits, or null if not a number. */
export function parseRoomSize(text, unit, key) {
  const parsed = parseLength(text, unit);
  if (!parsed.ok) return null;
  const [lo, hi] = ROOM_SIZE_LIMITS[key];
  return Math.min(Math.max(parsed.mm, lo), hi);
}

/**
 * The room's words in this language, any missing one taken from English (nested groups too), so
 * a language without (all) room strings shows English rather than breaking the panel.
 */
export function roomStrings(t) {
  const base = STRINGS.en.room;
  const own = t?.room ?? {};
  const isGroup = (value) => value && typeof value === 'object';
  return Object.fromEntries(Object.entries(base).map(([key, fallback]) => [
    key, isGroup(fallback) ? { ...fallback, ...(isGroup(own[key]) ? own[key] : {}) } : own[key] ?? fallback,
  ]));
}

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
 * units: the display-unit preference (cm/mm/in); room sizes are shown and typed in it, kept in mm.
 */
export function mountRoomControls({ buttonHost, viewerHost, roomState, language, getDesign, onView = () => {}, onInset = () => {}, units = null }) {
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

  function sizeField(key, label, s, room, unit) {
    const id = `room-size-${key}`;
    const input = el('input', {
      className: 'field__input room-size__input',
      attrs: { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': `${id}-unit ${id}-message` },
    });
    input.value = shownLength(room.size[key], unit);
    input.dataset.testid = id;
    const message = el('p', { className: 'room-size__message', attrs: { id: `${id}-message`, role: 'alert' } });
    const commit = () => {
      const mm = parseRoomSize(input.value, unit, key);
      if (mm === null) {
        message.textContent = s.invalidSize;
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      message.textContent = '';
      input.removeAttribute('aria-invalid');
      if (mm === room.size[key]) input.value = shownLength(mm, unit);
      else roomState.set({ size: { [key]: mm } });
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit();
    });
    return el('div', { className: 'room-size__field' }, [
      el('label', { text: label, attrs: { for: id } }),
      el('div', { className: 'room-size__box' }, [input, el('span', { className: 'room-size__unit', text: s.units[unit], attrs: { id: `${id}-unit` } })]),
      message,
    ]);
  }

  function renderPanel(t) {
    const room = roomState.get();
    panel.hidden = !room.enabled;
    if (!room.enabled) return;
    const s = t.room;
    const design = getDesign();
    const box = roomBox(design, room);
    const unit = units?.get() ?? DEFAULT_UNIT;
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
        sizeField('width', s.width, s, room, unit),
        sizeField('length', s.length, s, room, unit),
        sizeField('height', s.ceiling, s, room, unit),
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
    const strings = { ...t, room: roomStrings(t) };
    renderButton(strings);
    renderHint(strings);
    renderPanel(strings);
    if (focusKey) {
      const [group, value] = focusKey.split('|');
      const again = value
        ? [...panel.querySelectorAll(`[role=group] [data-value="${value}"]`)].find((b) => b.closest('[role=group]').getAttribute('aria-label') === group)
        : panel.querySelector(`#${CSS.escape(group)}`);
      again?.focus();
    }
  }

  // Tell the viewer how much of it the panel covers: one side, or the bottom when it is a sheet.
  const reportInset = () => {
    if (panel.hidden) {
      onInset({ left: 0, right: 0, bottom: 0 });
      return;
    }
    const sheet = panel.offsetWidth > viewerHost.clientWidth * 0.75;
    const side = !sheet && !collapsed ? panel.offsetWidth + 12 : 0;
    const rtl = panel.getAttribute('dir') === 'rtl';
    onInset({ left: rtl ? side : 0, right: rtl ? 0 : side, bottom: sheet ? panel.offsetHeight + 8 : 0 });
  };
  new ResizeObserver(reportInset).observe(viewerHost);
  roomState.subscribe(render);
  language.subscribe(render);
  units?.subscribe(render);
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
