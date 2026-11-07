// App-wide UI language. Hebrew (RTL) is the default; English is available from the top bar.
// `t()` reads the current table, so modules that render from state pick up a language change
// on their next render. The chat keeps its own language object (chat/i18n.js), which follows
// the UI language whenever the customer switches it here.
import { createLanguage } from '../chat/i18n.js';
import { CATALOG_NAMES, UI_STRINGS } from './strings.js';

const STORAGE_KEY = 'banai.ui.language';
let current = 'he';

export const getUiLanguage = () => current;

/** The current string table (UI_STRINGS.he / .en). */
export const t = () => UI_STRINGS[current];

export function setUiLanguage(language) {
  if (UI_STRINGS[language]) current = language;
}

/** Display name for a catalog entry in the current language. */
export const catalogName = (entry) => CATALOG_NAMES[current]?.[entry.id] ?? entry.name;

/**
 * The remembered UI language (separate from the chat language). It drives `t()`: its first
 * listener updates the current table, so every later listener already renders in the new language.
 */
export function createUiLanguage(options = {}) {
  const language = createLanguage({ storageKey: STORAGE_KEY, ...options });
  setUiLanguage(language.get());
  language.subscribe(setUiLanguage);
  return language;
}

/**
 * Apply the language to the document: <html lang/dir>, the title, and every static element marked
 * with data-i18n="section.key" (text) or data-i18n-aria="section.key" (aria-label).
 */
export function applyDocumentLanguage(root = document) {
  const strings = t();
  const lookup = (path) => path.split('.').reduce((node, key) => node?.[key], strings);
  root.documentElement.lang = current;
  root.documentElement.dir = strings.dir;
  root.title = strings.app.title;
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = lookup(node.dataset.i18n);
    if (typeof value === 'string') node.textContent = value;
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const value = lookup(node.dataset.i18nAria);
    if (typeof value === 'string') node.setAttribute('aria-label', value);
  });
}
