// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { cm } from '../viewer/format.js';
import { shareHash } from '../share/link.js';
import { ENTRY_POINTS } from './entryPoints.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';

const sizeLabel = ({ width, height, depth }) => `${cm(width)} × ${cm(height)} × ${cm(depth)} cm`;
const dateLabel = (savedAt) => new Date(savedAt).toLocaleString(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Opening goes through the normal page load, so a link that no longer works is handled in one place.
const openSaved = (entry) => {
  window.location.hash = shareHash(entry);
  window.location.reload();
};

/** "Your saved designs": links saved in this browser. Null when there are none. */
function recentSection(recent, onForget, focusFallback) {
  if (!recent.length) return null;
  const list = el('ul', { className: 'recent__list' });
  const section = el('section', { className: 'recent', attrs: { 'aria-labelledby': 'recent-title' } }, [
    el('h2', { className: 'recent__title', text: 'Your saved designs', attrs: { id: 'recent-title' } }),
    el('p', { className: 'recent__note', text: 'Kept only in this browser.' }),
    list,
  ]);
  section.dataset.testid = 'recent-designs';
  recent.forEach((entry) => {
    const open = el('button', { className: 'recent__open', attrs: { type: 'button' } }, [
      el('span', { className: 'recent__size', text: sizeLabel(entry.dimensions) }),
      el('span', { className: 'recent__date', text: `Saved ${dateLabel(entry.savedAt)}` }),
    ]);
    open.dataset.testid = 'recent-open';
    open.addEventListener('click', () => openSaved(entry));
    const remove = el('button', { className: 'btn btn--ghost', text: 'Remove from list', attrs: { type: 'button', 'aria-label': `Remove ${sizeLabel(entry.dimensions)} from list` } });
    remove.dataset.testid = 'recent-remove';
    const item = el('li', { className: 'recent__item' }, [open, remove]);
    remove.addEventListener('click', () => {
      onForget(entry.designId);
      const next = item.nextElementSibling ?? item.previousElementSibling;
      item.remove();
      if (next) next.querySelector('.recent__open').focus();
      else {
        section.remove();
        focusFallback();
      }
    });
    list.append(item);
  });
  return section;
}

export function mountStartScreen({ onChoose, recent = [], onForget = () => {} }) {
  const cards = ENTRY_POINTS.map((entry) => {
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
      document.createTextNode(`${entry.action} `),
      icon('arrow', { size: 18 }),
    ]);
    action.dataset.testid = `entry-${entry.id}`;
    const card = el('article', { className: 'entry-card' }, [
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
      el('h2', { className: 'entry-card__title', text: entry.title }),
      el('p', { className: 'entry-card__text', text: entry.description }),
      action,
    ]);
    action.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      onChoose(entry);
    });
    return card;
  });

  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } }, [
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 })]),
    el('main', { className: 'start__main' }, [
      el('h1', { className: 'start__title', text: 'Design your wardrobe', attrs: { id: 'start-title' } }),
      el('p', { className: 'start__subtitle', text: 'Choose how you would like to begin. You can switch between the AI designer and manual editing at any time.' }),
      el('div', { className: 'start__cards' }, cards),
      ...[recentSection(recent, onForget, () => cards[0].querySelector('button').focus())].filter(Boolean),
      el('p', { className: 'start__footnote', text: START_FOOTNOTE }),
      el('a', { className: 'start__footnote', text: 'הצהרת נגישות', attrs: { href: '/accessibility.html', lang: 'he' } }),
    ]),
  ]);
  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
