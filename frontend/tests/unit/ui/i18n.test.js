import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _setSiteLanguageForTests, catalogName, DEFAULT_SITE_LANGUAGE, onSiteLanguageChange, setSiteLanguage, siteLanguage, strings,
} from '../../../src/ui/i18n.js';
import { friendlyError } from '../../../src/editor/opsFromForm.js';
import { describeSelection } from '../../../src/viewer/format.js';
import { TEMPLATES } from '../../../src/domain/presets.js';
import { ENTRY_POINTS } from '../../../src/entry/entryPoints.js';
import { THEMES } from '../../../src/ui/theme.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const memoryStorage = () => {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

// Every key path, with functions compared by arity (same placeholders in both languages).
const shape = (value, path = '') => {
  if (typeof value === 'function') return [`${path}()${value.length}`];
  if (value && typeof value === 'object') return Object.keys(value).sort().flatMap((key) => shape(value[key], `${path}.${key}`));
  return [path];
};

afterEach(() => _setSiteLanguageForTests('en'));

describe('site language', () => {
  it('defaults to Hebrew, right to left', () => {
    expect(DEFAULT_SITE_LANGUAGE).toBe('he');
    expect(strings('he').dir).toBe('rtl');
    expect(strings('en').dir).toBe('ltr');
  });

  it('Hebrew and English define exactly the same strings', () => {
    expect(shape(strings('he'))).toEqual(shape(strings('en')));
  });

  it('covers every entry point, template and theme', () => {
    for (const language of ['he', 'en']) {
      const t = strings(language);
      ENTRY_POINTS.forEach(({ id }) => expect(t.entries[id].title).toBeTruthy());
      TEMPLATES.forEach(({ id }) => expect(t.templates[id].title).toBeTruthy());
      THEMES.forEach(({ id }) => expect(t.themeNames[id]).toBeTruthy());
    }
  });

  it('names every catalog entry in Hebrew, and keeps the catalog name in English', () => {
    const catalog = loadCatalog();
    const entries = [...catalog.materials, ...catalog.colors, ...catalog.finishes];
    _setSiteLanguageForTests('he');
    entries.forEach((entry) => expect(catalogName(entry)).toMatch(/[֐-׿]|MDF/));
    _setSiteLanguageForTests('en');
    entries.forEach((entry) => expect(catalogName(entry)).toBe(entry.name));
  });

  it('switches, remembers the choice and notifies listeners', () => {
    const storage = memoryStorage();
    const listener = vi.fn();
    const stop = onSiteLanguageChange(listener);
    setSiteLanguage('he', { storage });
    expect(siteLanguage()).toBe('he');
    expect(storage.data['banai.site.language']).toBe('he');
    expect(listener).toHaveBeenCalledWith('he');
    setSiteLanguage('fr', { storage }); // unknown: ignored
    setSiteLanguage('he', { storage }); // unchanged: no event
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('translates error messages and 3D descriptions', () => {
    _setSiteLanguageForTests('he');
    expect(friendlyError({ code: 'OVERLAP' })).toMatch(/יחפוף/);
    expect(friendlyError({ code: 'SOMETHING_NEW' })).toBe(strings('he').errorFallback);
    const design = loadDesign('basic');
    expect(describeSelection(design, { id: 'shf_l2', kind: 'shelf' })).toBe('מדף · 80.0 ס"מ מהבסיס · עובי 1.8 ס"מ');
  });
});
