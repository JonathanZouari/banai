import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createLanguage, DEFAULT_LANGUAGE, detectLanguage, ENGLISH_WORDS, FRENCH_WORDS, LANGUAGES, STRINGS, stringsFor,
} from '../../../src/chat/i18n.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const readRepo = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf-8');

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
};

describe('chat strings', () => {
  it('every language defines exactly the same keys', () => {
    const keys = (lang) => Object.keys(STRINGS[lang]).sort();
    LANGUAGES.forEach((lang) => expect(keys(lang)).toEqual(keys(DEFAULT_LANGUAGE)));
    expect(STRINGS.he.dir).toBe('rtl');
    expect(STRINGS.en.dir).toBe('ltr');
    expect(STRINGS.fr.dir).toBe('ltr');
  });

  it('falls back to the default language for unknown codes', () => {
    expect(stringsFor('fr')).toBe(STRINGS.fr);
    expect(stringsFor('de')).toBe(STRINGS[DEFAULT_LANGUAGE]);
    expect(STRINGS.en.changeCount(1)).toBe('1 change');
    expect(STRINGS.he.changeCount(3)).toBe('3 שינויים');
    expect(STRINGS.fr.changeCount(2)).toBe('2 modifications');
  });

  it("each language's starter prompts are detected as that language", () => {
    LANGUAGES.forEach((lang) => STRINGS[lang].suggestions.forEach((text) => {
      expect(detectLanguage(text, 'he'), text).toBe(lang);
    }));
  });
});

describe('createLanguage', () => {
  it('defaults to Hebrew, remembers the choice and notifies listeners', () => {
    const storage = memoryStorage();
    const language = createLanguage({ storage });
    expect(language.get()).toBe('he');
    const listener = vi.fn();
    language.subscribe(listener);
    language.set('en');
    language.set('en'); // no-op
    language.set('xx'); // ignored
    expect(language.get()).toBe('en');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createLanguage({ storage }).get()).toBe('en'); // restored on the next visit
  });

  it('ignores junk in storage and survives blocked storage', () => {
    expect(createLanguage({ storage: memoryStorage({ 'banai.chat.language': 'zz' }) }).get()).toBe('he');
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const language = createLanguage({ storage: blocked });
    expect(language.get()).toBe('he');
    language.set('en');
    expect(language.get()).toBe('en');
  });
});

describe('detectLanguage', () => {
  it('detects Hebrew, English, mixed (Hebrew wins) and no letters', () => {
    expect(detectLanguage('תוסיף מדף')).toBe('he');
    expect(detectLanguage('Add a shelf')).toBe('en');
    expect(detectLanguage('תצבע ב-Walnut')).toBe('he');
    expect(detectLanguage('240?')).toBeNull();
  });

  it('matches the backend on the shared cases', () => {
    const { cases } = JSON.parse(readRepo('shared', 'fixtures', 'language', 'detect.json'));
    cases.forEach(({ text, current, expected }) => {
      expect(detectLanguage(text, current), `${current}: ${text}`).toBe(expected);
    });
  });

  it('uses the same word lists as the backend', () => {
    const backend = readRepo('backend', 'app', 'agent', 'language.py');
    const list = (name) => new Set(backend.match(new RegExp(`${name} = frozenset\\("""([^"]*)"""`))[1].trim().split(/\s+/));
    expect([...FRENCH_WORDS].sort()).toEqual([...list('FRENCH_WORDS')].sort());
    expect([...ENGLISH_WORDS].sort()).toEqual([...list('ENGLISH_WORDS')].sort());
  });
});
