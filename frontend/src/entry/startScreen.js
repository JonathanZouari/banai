// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createLogo } from '../ui/logo.js';
import { ENTRY_POINTS } from './entryPoints.js';
import { TEMPLATES } from '../domain/presets.js';

export const START_FOOTNOTE = 'Designs are illustrative previews and are not manufacturing drawings.';

/** The starting templates offered below the three entry cards (`basic` has its own card). */
export const STARTING_TEMPLATES = Object.freeze(TEMPLATES.filter((template) => template.id !== 'basic'));

export function mountStartScreen({ onChoose, onTemplate = () => true }) {
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

  // Starting templates: pick one and the editor opens with that design instead of the basic wardrobe.
  const templateButtons = STARTING_TEMPLATES.map((template) => {
    const button = el('button', { className: 'template-card', attrs: { type: 'button' } }, [
      el('span', { className: 'template-card__name', text: template.name }),
      el('span', { className: 'template-card__text', text: template.description }),
    ]);
    button.dataset.testid = `template-${template.id}`;
    button.addEventListener('click', () => {
      if (onTemplate(template) === false) return; // could not be built: stay on the start screen
      dialog.close();
      dialog.remove();
      // Same path as the basic card, so keyboard focus moves to the Properties panel after the modal closes.
      onChoose({ id: `template-${template.id}`, focusesChat: false, template });
    });
    return button;
  });

  const dialog = el('dialog', { className: 'start', attrs: { 'aria-labelledby': 'start-title' } }, [
    el('header', { className: 'start__bar' }, [createLogo({ size: 36 })]),
    el('main', { className: 'start__main' }, [
      el('h1', { className: 'start__title', text: 'Design your wardrobe', attrs: { id: 'start-title' } }),
      el('p', { className: 'start__subtitle', text: 'Choose how you would like to begin. You can switch between the AI designer and manual editing at any time.' }),
      el('div', { className: 'start__cards' }, cards),
      el('section', { className: 'start__templates', attrs: { 'aria-labelledby': 'start-templates-title' } }, [
        el('h2', { className: 'start__templates-title', text: 'Or start from a template', attrs: { id: 'start-templates-title' } }),
        el('div', { className: 'start__template-list' }, templateButtons),
      ]),
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
