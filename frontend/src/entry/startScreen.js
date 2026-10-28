// Start screen: three ways in (plus ready-made templates), one editor. Shown on load as a modal;
// choosing an option closes it. It has its own language button (the top bar is behind the modal).
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { onSiteLanguageChange, strings } from '../ui/i18n.js';
import { ENTRY_POINTS, TEMPLATE_ENTRIES } from './entryPoints.js';
import { illustration } from './illustrations.js';

export function mountStartScreen({ onChoose, languageButton }) {
  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } });
  const choose = (entry) => {
    unsubscribe();
    dialog.close();
    dialog.remove();
    onChoose(entry);
  };
  const card = (entry, text, { heading, compact }) => {
    const action = el('button', { className: 'btn', attrs: { type: 'button' } }, [
      document.createTextNode(`${text.action} `),
      icon('arrow', { size: 18 }),
    ]);
    action.dataset.testid = `entry-${entry.id}`;
    action.addEventListener('click', () => choose(entry));
    return el('article', { className: compact ? 'entry-card entry-card--compact' : 'entry-card' }, [
      el('div', { className: 'entry-card__art' }, [illustration(entry.templateId ?? entry.id)]),
      el(heading, { className: 'entry-card__title', text: text.title }),
      el('p', { className: 'entry-card__text', text: text.description }),
      action,
    ]);
  };

  const render = () => {
    const t = strings();
    const focusedId = dialog.contains(document.activeElement) ? document.activeElement.dataset.testid : undefined;
    const cards = ENTRY_POINTS.map((entry) => card(entry, t.entries[entry.id], { heading: 'h2' }));
    const templates = TEMPLATE_ENTRIES.map((entry) => card(entry, { ...t.templates[entry.templateId], action: t.useTemplate }, { heading: 'h3', compact: true }));
    dialog.replaceChildren(
      el('header', { className: 'start__bar' }, [createLogo({ size: 36 }), ...(languageButton ? [languageButton()] : [])]),
      el('main', { className: 'start__main' }, [
        el('h1', { className: 'start__title', text: t.startTitle, attrs: { id: 'start-title' } }),
        el('p', { className: 'start__subtitle', text: t.startSubtitle }),
        el('div', { className: 'start__cards' }, cards),
        el('section', { className: 'start__templates', attrs: { 'aria-labelledby': 'start-templates-title' } }, [
          el('h2', { className: 'start__templates-title', text: t.templatesTitle, attrs: { id: 'start-templates-title' } }),
          el('div', { className: 'start__cards' }, templates),
        ]),
        el('p', { className: 'start__footnote', text: t.startFootnote }),
        el('a', { className: 'start__footnote', text: t.accessibilityStatement, attrs: { href: '/accessibility.html', hreflang: 'he' } }),
      ]),
    );
    // Re-rendering replaces every control: keep keyboard focus on the same one (WCAG 2.4.3).
    if (focusedId) dialog.querySelector(`[data-testid="${CSS.escape(focusedId)}"]`)?.focus();
  };
  const unsubscribe = onSiteLanguageChange(render);
  render();

  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
