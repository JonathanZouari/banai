// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { language } from '../i18n/strings.js';
import { ENTRY_POINTS } from './entryPoints.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';

/** "Last designs": opens the local archive. The count follows the archive, in every language. */
function createArchiveButton({ archive, archiveDialog }) {
  const label = el('span');
  const badge = el('span', { className: 'archive-badge' });
  badge.dataset.testid = 'archive-count';
  const node = el('button', { className: 'btn btn--ghost start__archive', attrs: { type: 'button' } }, [icon('history'), label, badge]);
  node.dataset.testid = 'entry-archive';
  const sync = () => {
    const n = archive.isAvailable() ? archive.list().length : 0;
    label.textContent = language.t('arcOpenButton');
    badge.textContent = String(n);
    badge.hidden = n === 0;
    node.setAttribute('aria-label', language.t('arcOpenAria').replace('{n}', String(n)));
  };
  node.addEventListener('click', archiveDialog.open);
  archive.subscribe(sync);
  language.subscribe(sync);
  sync();
  return node;
}

export function mountStartScreen({ onChoose, archive = null, archiveDialog = null }) {
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
      ...(archive && archiveDialog ? [createArchiveButton({ archive, archiveDialog })] : []),
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
