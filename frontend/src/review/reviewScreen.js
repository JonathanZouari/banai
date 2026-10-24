// Review and send (Stitch-style summary screen): a picture of the wardrobe, one card per part of the
// design with an "Edit" link back to it, the room fit, then save -> private link -> PDF -> send to the
// carpenter from the customer's own email or WhatsApp. No price and no manufacturing promise.
// It overlays the workspace under the top bar; every text is set with textContent.
import { el, button } from '../editor/fields.js';
import { toCmText } from '../editor/opsFromForm.js';
import { stepSummaries } from '../editor/steps.js';
import { t } from '../ui/i18n.js';
import { checkFit } from '../room/roomModel.js';
import { isShareableLink, shareLinks } from './share.js';

const SECTIONS = Object.freeze(['dimensions', 'doors', 'interior', 'materials', 'notes', 'room']);

/**
 * store: app store. photos: the room photo store (shown only as a local thumbnail). render(design,
 * catalog): a JPEG data URL of the wardrobe, or throws. onEdit(section): go back to that part.
 * onBack(): back to the designer. onSave(): saves and resolves to the private link. onPdf(): opens
 * the PDF dialog. storage: whether saving is available. getLink(): the current private link or ''.
 */
export function mountReview({ store, photos, render, onEdit, onBack, onSave, onPdf, storage, getLink }) {
  const root = el('div', { className: 'review', attrs: { role: 'region', 'aria-labelledby': 'review-title' } });
  root.dataset.testid = 'review';
  root.hidden = true;
  let picture = { design: null, url: null, failed: false };
  let saving = false;
  let status = { text: '', kind: '' };

  function pictureCard(design, s) {
    if (picture.design !== design) {
      try {
        picture = { design, url: render(design, store.getState().catalog), failed: false };
      } catch {
        picture = { design, url: null, failed: true };
      }
    }
    const body = picture.url
      ? el('img', { className: 'review__picture', attrs: { src: picture.url, alt: s.pictureAlt } })
      : el('p', { className: 'panel__note', text: s.pictureUnavailable });
    if (picture.url) body.dataset.testid = 'review-picture';
    return el('section', { className: 'review__card review__card--picture', attrs: { 'aria-label': s.picture } }, [body]);
  }

  function roomLines(design, room, s) {
    const fit = checkFit(design, room);
    if (fit.status === 'empty') return [s.roomNone];
    const cm = (mm) => (mm === null ? s.notMeasured : `${toCmText(mm)} ${t().units.cm}`);
    const lines = [t().room.fitStatus[fit.status], s.roomWall(cm(room.width), cm(room.height), cm(room.depth))];
    if (room.obstacles.length) lines.push(s.obstacles(room.obstacles.map((id) => t().room.obstacleTypes[id]).join(', ')));
    return lines;
  }

  function card(section, lines, s, extra = []) {
    const heading = el('h3', { className: 'review__card-title', text: s.sections[section] });
    const edit = button(s.edit, () => onEdit(section), { variant: 'ghost', testId: `review-edit-${section}` });
    edit.setAttribute('aria-label', s.editLabel(s.sections[section]));
    const node = el('section', { className: 'review__card' }, [
      el('header', { className: 'review__card-head' }, [heading, edit]),
      ...lines.map((line) => el('p', { className: 'review__line', text: line })),
      ...extra,
    ]);
    node.dataset.testid = `review-${section}`;
    return node;
  }

  function actions(s) {
    const link = getLink();
    const shareable = isShareableLink(link);
    const statusLine = el('p', { className: `review__status review__status--${status.kind}`, text: status.text, attrs: { role: status.kind === 'error' ? 'alert' : 'status' } });
    statusLine.dataset.testid = 'review-status';
    const save = button(saving ? s.saving : link ? s.saveAgain : s.save, async () => {
      if (saving) return; // one save at a time: a double click never sends twice
      saving = true;
      status = { text: s.saving, kind: 'info' };
      build();
      try {
        await onSave();
        status = { text: s.saved, kind: 'ok' };
      } catch (error) {
        status = { text: error?.message || s.saveFailed, kind: 'error' };
      } finally {
        saving = false;
        build();
        root.querySelector(status.kind === 'error' ? '[data-testid="review-save"]' : '[data-testid="review-link"]')?.focus();
      }
    }, { variant: 'primary', testId: 'review-save', disabled: !storage || saving });
    const pdf = button(s.pdf, () => onPdf(), { variant: 'secondary', testId: 'review-pdf' });
    const items = [el('div', { className: 'button-row' }, [save, pdf]), statusLine];
    if (!storage) items.push(el('p', { className: 'panel__note', text: s.saveUnavailable }));
    if (shareable) {
      const field = el('input', { className: 'field__input', attrs: { id: 'review-link', type: 'text', readonly: '', dir: 'ltr', 'aria-label': s.linkLabel } });
      field.value = link;
      field.dataset.testid = 'review-link';
      const copyStatus = el('p', { className: 'review__status', attrs: { role: 'status' } });
      const copy = button(s.copy, async () => {
        try {
          await navigator.clipboard.writeText(link);
          copyStatus.textContent = s.copied;
        } catch {
          field.select();
          copyStatus.textContent = s.copyManual;
        }
      }, { variant: 'secondary', testId: 'review-copy' });
      const hrefs = shareLinks(link, s);
      const email = el('a', { className: 'btn btn--secondary', text: s.email, attrs: { href: hrefs.mailto } });
      email.dataset.testid = 'review-email';
      const whatsapp = el('a', { className: 'btn btn--secondary', text: s.whatsapp, attrs: { href: hrefs.whatsapp, target: '_blank', rel: 'noopener noreferrer' } });
      whatsapp.dataset.testid = 'review-whatsapp';
      items.push(
        el('div', { className: 'field' }, [el('label', { className: 'field__label', text: s.linkLabel, attrs: { for: 'review-link' } }), field]),
        el('p', { className: 'dialog__note', text: s.linkWarning }),
        el('h3', { className: 'review__card-title', text: s.send }),
        el('div', { className: 'button-row' }, [copy, email, whatsapp]),
        copyStatus,
      );
    } else if (storage) {
      items.push(el('p', { className: 'panel__note', text: s.sendHint }));
    }
    const box = el('section', { className: 'review__card review__actions', attrs: { 'aria-label': s.send } }, items);
    box.dataset.testid = 'review-actions';
    return box;
  }

  function build() {
    const s = t().review;
    const { design, catalog, request } = store.getState();
    const summary = stepSummaries(design, catalog, request.notes);
    const photo = photos.get();
    const photoThumb = photo
      ? [el('img', { className: 'review__room-photo', attrs: { src: photo.url, alt: s.roomPhotoAlt } }), el('p', { className: 'review__line review__line--muted', text: s.roomPhoto })]
      : [];
    const notes = request.notes.trim() ? request.notes.trim().split('\n') : [summary.notes];
    const back = button(s.back, () => onBack(), { variant: 'ghost', testId: 'review-back' });
    root.replaceChildren(el('div', { className: 'review__inner' }, [
      el('div', { className: 'review__top' }, [back]),
      el('h1', { className: 'review__title', text: s.title, attrs: { id: 'review-title' } }),
      el('p', { className: 'review__subtitle', text: s.subtitle }),
      el('div', { className: 'review__grid' }, [
        pictureCard(design, s),
        el('div', { className: 'review__cards' }, SECTIONS.map((section) => {
          if (section === 'notes') return card(section, notes, s);
          if (section === 'room') return card(section, roomLines(design, request.room, s), s, photoThumb);
          return card(section, [summary[section]], s);
        })),
      ]),
      actions(s),
      el('p', { className: 'review__notice', text: s.notice }),
    ]));
  }

  document.body.append(root);
  return {
    element: root,
    show() {
      build();
      root.hidden = false;
      root.scrollTop = 0;
      root.querySelector('#review-title')?.setAttribute('tabindex', '-1');
      root.querySelector('#review-title')?.focus({ preventScroll: true });
    },
    hide() { root.hidden = true; },
    refresh() { if (!root.hidden) build(); },
  };
}
