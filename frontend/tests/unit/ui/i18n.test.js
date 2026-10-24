import { afterEach, describe, expect, it } from 'vitest';
import { applyDocumentLanguage, catalogName, createUiLanguage, getUiLanguage, setUiLanguage, t } from '../../../src/ui/i18n.js';
import { UI_STRINGS } from '../../../src/ui/strings.js';

/** Every key path in a nested table, with the type of its value. */
function shape(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? shape(value, path) : [`${path}:${typeof value}`];
  }).sort();
}

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

afterEach(() => setUiLanguage('he'));

describe('UI strings', () => {
  it('Hebrew and English have exactly the same keys and value types', () => {
    expect(shape(UI_STRINGS.en)).toEqual(shape(UI_STRINGS.he));
  });

  it('Hebrew is RTL and English is LTR', () => {
    expect(UI_STRINGS.he.dir).toBe('rtl');
    expect(UI_STRINGS.en.dir).toBe('ltr');
  });

  it('builds strings with numbers in both languages', () => {
    expect(UI_STRINGS.he.viewer.width('200.0')).toBe('רוחב 200.0 ס״מ');
    expect(UI_STRINGS.en.viewer.width('200.0')).toBe('W 200.0 cm');
    expect(UI_STRINGS.he.editor.itemLabel(2, 'מדף', 3)).toBe('תא 2 · מדף 3');
  });
});

describe('UI language', () => {
  it('defaults to Hebrew and remembers the choice', () => {
    const storage = memoryStorage();
    const language = createUiLanguage({ storage });
    expect(language.get()).toBe('he');
    expect(getUiLanguage()).toBe('he');
    language.set('en');
    expect(getUiLanguage()).toBe('en');
    expect(t().editor.width).toBe('Width');
    expect(createUiLanguage({ storage }).get()).toBe('en');
  });

  it('updates t() before any other listener runs', () => {
    const language = createUiLanguage({ storage: memoryStorage() });
    let seen = null;
    language.subscribe(() => { seen = t().editor.width; });
    language.set('en');
    expect(seen).toBe('Width');
  });

  it('ignores unknown languages', () => {
    setUiLanguage('fr');
    expect(getUiLanguage()).toBe('he');
  });

  it('names catalog entries in the UI language, falling back to the catalog name', () => {
    expect(catalogName({ id: 'white', name: 'White' })).toBe('לבן');
    expect(catalogName({ id: 'unknown_new', name: 'New colour' })).toBe('New colour');
    setUiLanguage('en');
    expect(catalogName({ id: 'white', name: 'White' })).toBe('White');
  });
});

/** A minimal stand-in for `document`: only what applyDocumentLanguage touches. */
function fakeDocument() {
  const node = (dataset, text = '') => {
    const attrs = new Map();
    return { dataset, textContent: text, setAttribute: (k, v) => attrs.set(k, v), getAttribute: (k) => attrs.get(k) ?? null };
  };
  const save = node({ i18n: 'app.save' }, 'x');
  const viewer = node({ i18nAria: 'app.viewerLabel' });
  const missing = node({ i18n: 'app.missing' }, 'keep');
  return {
    documentElement: {}, title: '', save, viewer, missing,
    querySelectorAll: (selector) => (selector === '[data-i18n]' ? [save, missing] : [viewer]),
  };
}

describe('applyDocumentLanguage', () => {
  it('sets lang/dir/title and rewrites marked text and aria-labels', () => {
    const doc = fakeDocument();
    applyDocumentLanguage(doc);
    expect(doc.documentElement.dir).toBe('rtl');
    expect(doc.documentElement.lang).toBe('he');
    expect(doc.save.textContent).toBe('שמירה');
    expect(doc.viewer.getAttribute('aria-label')).toBe('תצוגת תלת-ממד של הארון');
    expect(doc.missing.textContent).toBe('keep'); // unknown keys leave the text alone
    setUiLanguage('en');
    applyDocumentLanguage(doc);
    expect(doc.documentElement.dir).toBe('ltr');
    expect(doc.title).toBe('BanAI Wardrobe Designer');
    expect(doc.save.textContent).toBe('Save');
  });
});
