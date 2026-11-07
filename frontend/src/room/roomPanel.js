// Room-fit panel (the right-hand column in the "Room fit" view): the wall measurements, a basic fit
// check that updates as the design or the room changes, obstacles, the room photo, and a text
// description the AI designer can base colour suggestions on. Room data lives in the store's request
// data (not the design); the photo lives only in the photo store (browser memory).
import { el, button, optionalCmField } from '../editor/fields.js';
import { toCmText } from '../editor/opsFromForm.js';
import { stepSummaries } from '../editor/steps.js';
import { MAX_ROOM_TEXT, OBSTACLES, ROOM_LIMITS_MM } from '../state/request.js';
import { plainText } from '../ui/bidi.js';
import { t } from '../ui/i18n.js';
import { checkFit } from './roomModel.js';
import { PHOTO_TYPES } from './photo.js';

const cmText = (mm) => String(Math.round(mm / 10));

function fitView(design, room) {
  const s = t().room;
  const result = checkFit(design, room);
  const lines = result.status === 'empty' ? [] : result.lines.map((line) => {
    const label = s.fitLine[line.field];
    let text = s.fitMissing(label);
    if (line.status === 'ok') text = s.fitOk(label, toCmText(line.wardrobe), toCmText(line.room));
    if (line.status === 'over') text = s.fitOver(label, toCmText(line.over));
    const item = el('li', { className: `fit__line fit__line--${line.status}`, text });
    item.dataset.testid = `fit-${line.field}`;
    return item;
  });
  const notes = [s.fitDisclaimer];
  if (design.doors.type === 'hinged') notes.push(s.fitHinged);
  if (room.obstacles.length) notes.push(s.fitObstacles);
  const status = el('p', { className: `fit__status fit__status--${result.status}`, text: s.fitStatus[result.status] });
  status.dataset.testid = 'fit-status';
  const box = el('div', { className: 'fit', attrs: { role: 'status', 'aria-live': 'polite' } }, [
    status,
    ...(lines.length ? [el('ul', { className: 'fit__lines' }, lines)] : []),
    ...notes.map((text) => el('p', { className: 'fit__note', text })),
  ]);
  box.dataset.testid = 'fit-result';
  return box;
}

/**
 * store: the app store (design + request.room). photos: the photo store. onRecommend(text): sends a
 * chat message to the AI designer. Returns { refresh } for a language change.
 */
export function mountRoomPanel(root, { store, photos, onRecommend }) {
  let photoError = '';
  let rendered = { design: null };
  const fileInput = el('input', { className: 'room__file', attrs: { type: 'file', accept: PHOTO_TYPES.join(','), tabindex: '-1', 'aria-hidden': 'true' } });
  fileInput.dataset.testid = 'room-photo-input';

  async function usePhoto(file) {
    if (!file) return;
    const result = await photos.set(file);
    photoError = result.ok ? '' : t().room.photoErrors[result.reason];
    render(true);
    if (!result.ok) root.querySelector('[data-testid="room-photo-error"]')?.focus();
  }
  fileInput.addEventListener('change', () => {
    usePhoto(fileInput.files?.[0]);
    fileInput.value = ''; // choosing the same file again still triggers a change
  });

  const setRoom = (patch) => {
    store.setRoom(patch);
    root.querySelector('[data-testid="fit-result"]')?.replaceWith(fitView(store.getState().design, store.getState().request.room));
  };

  function measurement(field, label) {
    const [min, max] = ROOM_LIMITS_MM;
    return optionalCmField({
      label,
      mm: store.getState().request.room[field],
      testId: `room-${field}`,
      onCommit: (mm) => {
        if (mm !== null && (mm < min || mm > max)) return { ok: false, message: t().room.roomRange(cmText(min), cmText(max)) };
        setRoom({ [field]: mm });
        return { ok: true };
      },
    });
  }

  function textArea({ id, label, hint, value, testId, onInput }) {
    const area = el('textarea', { className: 'field__input notes__input', attrs: { id, rows: '3', dir: 'auto', maxlength: String(MAX_ROOM_TEXT), placeholder: hint } });
    area.dataset.testid = testId;
    area.value = value;
    area.addEventListener('input', () => {
      const clean = onInput(area.value);
      if (clean !== area.value) area.value = clean;
    });
    return el('div', { className: 'field' }, [el('label', { className: 'field__label', text: label, attrs: { for: id } }), area]);
  }

  function render(force = false) {
    const { design, request } = store.getState();
    if (!force && design === rendered.design) return;
    rendered = { design };
    const s = t().room;
    const { room } = request;
    const focused = root.contains(document.activeElement) ? document.activeElement.dataset.testid : undefined;

    const summary = stepSummaries(design, store.getState().catalog, request.notes);
    const designBox = el('div', { className: 'room__design' }, [
      el('p', { className: 'field__label', text: s.yourDesign }),
      el('p', { className: 'room__design-text', text: [summary.dimensions, summary.doors, summary.materials].join(' · ') }),
    ]);
    designBox.dataset.testid = 'room-design-summary';

    const obstacles = el('fieldset', { className: 'room__obstacles' }, [
      el('legend', { className: 'field__label', text: s.obstacles }),
      ...OBSTACLES.map((id) => {
        const box = el('input', { attrs: { type: 'checkbox', id: `obstacle-${id}` } });
        box.checked = room.obstacles.includes(id);
        box.dataset.testid = `obstacle-${id}`;
        box.addEventListener('change', () => {
          const current = store.getState().request.room.obstacles;
          setRoom({ obstacles: box.checked ? [...current, id] : current.filter((item) => item !== id) });
        });
        return el('label', { className: 'room__check', attrs: { for: `obstacle-${id}` } }, [box, document.createTextNode(s.obstacleTypes[id])]);
      }),
    ]);

    const photo = photos.get();
    const error = el('p', { className: 'field__message', text: photoError, attrs: { role: 'alert', tabindex: '-1' } });
    error.dataset.testid = 'room-photo-error';
    const choose = button(photo ? s.photoReplace : s.photoChoose, () => fileInput.click(), { variant: photo ? 'secondary' : 'primary', testId: 'room-photo-choose' });
    const photoActions = [choose];
    if (photo) {
      photoActions.push(button(s.photoRemove, () => {
        photos.remove();
        photoError = '';
        render(true);
        root.querySelector('[data-testid="room-photo-choose"]')?.focus();
      }, { variant: 'ghost', testId: 'room-photo-remove' }));
    }

    const recommendStatus = el('p', { className: 'field__message', attrs: { role: 'status' } });
    recommendStatus.dataset.testid = 'room-recommend-status';
    const recommend = button(s.recommend, () => {
      const style = store.getState().request.room.style.trim();
      if (!style) {
        recommendStatus.textContent = s.recommendNeedsStyle;
        return;
      }
      recommendStatus.textContent = '';
      const current = stepSummaries(store.getState().design, store.getState().catalog);
      onRecommend(s.recommendMessage(style, plainText([current.dimensions, current.doors, current.materials].join(', '))));
    }, { variant: 'secondary', testId: 'room-recommend' });

    root.replaceChildren(
      el('h2', { className: 'panel__title', text: s.title }),
      el('p', { className: 'panel__hint', text: s.intro }),
      designBox,
      el('section', { className: 'room__section', attrs: { 'aria-label': s.wall } }, [
        el('h3', { className: 'prop-section__title', text: s.wall }),
        el('div', { className: 'field-row field-row--3' }, [
          measurement('width', s.wallWidth), measurement('height', s.wallHeight), measurement('depth', s.wallDepth),
        ]),
        el('p', { className: 'panel__note', text: s.wallHint }),
      ]),
      el('section', { className: 'room__section', attrs: { 'aria-label': s.fit } }, [
        el('h3', { className: 'prop-section__title', text: s.fit }),
        fitView(design, room),
      ]),
      el('section', { className: 'room__section' }, [
        obstacles,
        textArea({
          id: 'room-obstacle-notes', label: s.obstacleNotes, hint: s.obstacleNotesHint, value: room.obstacleNotes, testId: 'room-obstacle-notes',
          onInput: (text) => store.setRoom({ obstacleNotes: text }).obstacleNotes,
        }),
      ]),
      el('section', { className: 'room__section', attrs: { 'aria-label': s.photo } }, [
        el('h3', { className: 'prop-section__title', text: s.photo }),
        el('p', { className: 'room__privacy', text: s.photoPrivacy }),
        el('p', { className: 'panel__note', text: s.photoTypes }),
        el('div', { className: 'button-row' }, photoActions),
        error,
        fileInput,
      ]),
      el('section', { className: 'room__section', attrs: { 'aria-label': s.style } }, [
        textArea({
          id: 'room-style', label: s.style, hint: s.styleHint, value: room.style, testId: 'room-style',
          onInput: (text) => store.setRoom({ style: text }).style,
        }),
        recommend,
        recommendStatus,
        el('p', { className: 'panel__note', text: s.recommendNote }),
      ]),
    );
    if (focused) root.querySelector(`[data-testid="${CSS.escape(focused)}"]`)?.focus();
  }

  store.subscribe(() => render());
  render(true);
  return {
    refresh: () => render(true),
    /** Use a photo dropped on the room view. */
    usePhoto,
  };
}
