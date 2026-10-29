// "עב | EN" switch for the app UI language. Buttons with aria-pressed, so it works by keyboard.
import { el } from '../editor/fields.js';
import { LANGUAGES } from '../chat/i18n.js';
import { t } from './i18n.js';

const NAMES = Object.freeze({ he: 'עב', en: 'EN' });
const TITLES = Object.freeze({ he: 'עברית', en: 'English' });

/** `language` is the UI language object (ui/i18n.js createUiLanguage). */
export function createLanguageSwitch(language, { testId = 'ui-language' } = {}) {
  const group = el('div', { className: 'lang-switch', attrs: { role: 'group', 'aria-label': t().app.languageLabel } });
  group.dataset.testid = testId;
  LANGUAGES.forEach((code) => {
    const option = el('button', {
      className: 'lang-switch__option',
      text: NAMES[code],
      attrs: { type: 'button', lang: code, title: TITLES[code], 'aria-pressed': String(code === language.get()) },
    });
    option.dataset.testid = `${testId}-${code}`;
    option.addEventListener('click', () => language.set(code));
    group.append(option);
  });
  const sync = () => {
    group.setAttribute('aria-label', t().app.languageLabel);
    group.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.lang === language.get())));
  };
  language.subscribe(sync);
  return group;
}
