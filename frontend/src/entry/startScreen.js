// Start screen: three ways in, one editor. Shown on load as a modal; choosing an option closes it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { ENTRY_POINTS } from './entryPoints.js';
import { CHAT_LANGUAGES, LANGUAGE_NAMES, getChatLanguage, onChatLanguage, setChatLanguage } from '../chat/chatI18n.js';

export const START_FOOTNOTE = 'התכנון הוא טיוטה לשיחה עם נגר. הנגר מאמת את המידות באתר לפני הייצור.';

/** The top bar's brand: the mark (cloned from the page, a static constant) and the name. */
function brand() {
  const mark = document.querySelector('.brand__mark')?.cloneNode(true);
  return el('div', { className: 'brand' }, [...(mark ? [mark] : []), el('span', { className: 'brand__name', text: 'בנאי' })]);
}

/** The conversation's language (ADR-029), chosen before the first word; the chat header can change it later. */
function languageChoice() {
  const buttons = CHAT_LANGUAGES.map((lang) => {
    const button = el('button', { className: 'segmented__option', text: LANGUAGE_NAMES[lang], attrs: { type: 'button', lang } });
    button.dataset.testid = `start-language-${lang}`;
    button.addEventListener('click', () => setChatLanguage(lang));
    return button;
  });
  const sync = (current) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(CHAT_LANGUAGES[i] === current)));
  sync(getChatLanguage());
  onChatLanguage(sync);
  return el('div', { className: 'start__language' }, [
    el('span', { className: 'start__language-label', text: 'שפת השיחה עם בוב:' }),
    el('div', { className: 'segmented segmented--sm', attrs: { role: 'group', 'aria-label': 'שפת השיחה' } }, buttons),
  ]);
}

export function mountStartScreen({ onChoose }) {
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
    el('header', { className: 'start__bar' }, [brand()]),
    el('main', { className: 'start__main' }, [
      el('h1', { className: 'start__title', text: 'מתכננים ארון', attrs: { id: 'start-title' } }),
      el('p', { className: 'start__subtitle', text: 'בחרו איך להתחיל. אפשר לעבור בכל רגע בין השיחה עם בוב הבנאי לבין עריכה ידנית.' }),
      el('div', { className: 'start__cards' }, cards),
      languageChoice(),
      el('p', { className: 'start__footnote', text: START_FOOTNOTE }),
    ]),
  ]);
  dialog.dataset.testid = 'start-screen';
  // A choice is required: Esc must not leave the user on a blank workspace.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
