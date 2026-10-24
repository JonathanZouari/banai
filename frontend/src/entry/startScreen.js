// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
// It has its own language switch (the top bar is behind the modal) and re-renders on a change.
import { el } from '../editor/fields.js';
import { t } from '../ui/i18n.js';
import { icon } from '../ui/icons.js';
import { createLanguageSwitch } from '../ui/languageSwitch.js';
import { createLogo } from '../ui/logo.js';
import { ENTRY_POINTS } from './entryPoints.js';

function content(onPick) {
  const s = t().start;
  const cards = ENTRY_POINTS.map((entry) => {
    const text = s.entries[entry.id];
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
      document.createTextNode(`${text.action} `),
      icon('arrow', { size: 18 }),
    ]);
    action.dataset.testid = `entry-${entry.id}`;
    action.addEventListener('click', () => onPick(entry));
    return el('article', { className: 'entry-card' }, [
      el('span', { className: 'entry-card__icon' }, [icon(entry.icon, { size: 24 })]),
      el('h2', { className: 'entry-card__title', text: text.title }),
      el('p', { className: 'entry-card__text', text: text.description }),
      action,
    ]);
  });
  return [
    el('h1', { className: 'start__title', text: s.title, attrs: { id: 'start-title' } }),
    el('p', { className: 'start__subtitle', text: s.subtitle }),
    el('div', { className: 'start__cards' }, cards),
    el('p', { className: 'start__footnote', text: s.footnote }),
    el('a', { className: 'start__footnote', text: s.a11yLink, attrs: { href: '/accessibility.html' } }),
  ];
}

/** `language`: the UI language object. `onChoose(entry)` runs after the modal closes. */
export function mountStartScreen({ onChoose, language }) {
  const main = el('main', { className: 'start__main' });
  const pick = (entry) => {
    dialog.close();
    dialog.remove();
    unsubscribe();
    onChoose(entry);
  };
  const render = () => {
    const focused = main.contains(document.activeElement) ? document.activeElement.dataset.testid : undefined;
    main.replaceChildren(...content(pick));
    if (focused) main.querySelector(`[data-testid="${CSS.escape(focused)}"]`)?.focus();
  };
  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } }, [
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 }), createLanguageSwitch(language, { testId: 'start-language' })]),
    main,
  ]);
  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  const unsubscribe = language.subscribe(render);
  render();
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
