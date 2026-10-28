// "Ready-made examples" (top bar): every start template, any time. Opening one replaces the
// current design, so the dialog says so before the customer chooses. Hebrew by default; the
// list is rebuilt in the current UI language each time it opens.
import { el, button } from '../editor/fields.js';
import { PRESETS } from '../domain/presets.js';
import { createDialog } from '../ui/dialog.js';

export const PRESET_STRINGS = Object.freeze({
  he: Object.freeze({
    button: 'דוגמאות מוכנות',
    intro: 'פתיחת דוגמה מחליפה את העיצוב הנוכחי. אחר כך אפשר לערוך אותה ידנית או עם ה-AI.',
    open: 'פתח',
    close: 'סגור',
    unit: 'ס"מ',
  }),
  en: Object.freeze({
    button: 'Ready-made examples',
    intro: 'Opening an example replaces the current design. You can then edit it by hand or with the AI.',
    open: 'Open',
    close: 'Close',
    unit: 'cm',
  }),
});

const stringsFor = (language) => PRESET_STRINGS[language] ?? PRESET_STRINGS.he;

export function createPresetsDialog({ onChoose, getLanguage = () => 'he' }) {
  const heading = 'presets-title';
  const intro = el('p');
  const list = el('ul', { className: 'preset-list' });
  const close = button('', () => dialog.close(), { variant: 'ghost' });
  const dialog = createDialog({ title: '', labelId: heading, testId: 'presets-dialog', body: [intro, list], actions: [close] });

  const fill = () => {
    const language = getLanguage();
    const s = stringsFor(language);
    dialog.element.lang = language;
    dialog.element.dir = language === 'he' ? 'rtl' : 'ltr';
    dialog.element.querySelector(`#${heading}`).textContent = s.button;
    intro.textContent = s.intro;
    close.textContent = s.close;
    list.replaceChildren(...PRESETS.map((preset) => el('li', { className: 'preset-item' }, [
      el('span', { className: 'preset-item__title', text: preset.title[language] ?? preset.title.he }),
      el('span', { className: 'preset-item__size', text: `${preset.size} ${s.unit}`, attrs: { dir: 'ltr' } }),
      button(s.open, () => {
        dialog.close();
        onChoose(preset.id);
      }, { variant: 'tonal', testId: `preset-open-${preset.id}` }),
    ])));
  };

  return {
    ...dialog,
    open: () => {
      fill();
      dialog.open();
    },
  };
}
