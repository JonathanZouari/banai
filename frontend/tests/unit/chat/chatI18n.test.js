import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAT_LANGUAGES, ct, getChatLanguage, isRtl, loadChatLanguage, onChatLanguage, saveChatLanguage, setChatLanguage,
  translatedSources,
} from '../../../src/chat/chatI18n.js';
import { AGENT_ERROR_MESSAGE, NOT_CONNECTED_MESSAGE, STALE_MESSAGE } from '../../../src/chat/chatModel.js';
import { VOICE_MESSAGES } from '../../../src/chat/voice.js';
import { AGENT_NAME, AI_VOICE_DISCLOSURE, SAMPLE_TEXT, speechErrorMessage } from '../../../src/chat/speech.js';
import { STATUS_LABELS } from '../../../src/settings/aiSettingsModel.js';

const HEBREW = /[֐-׿]/;
const SRC = fileURLToPath(new URL('../../../src', import.meta.url));

/** Every Hebrew literal passed to ct('…') in the chat column's sources. */
function ctLiterals() {
  const files = [...readdirSync(`${SRC}/chat`).map((f) => `${SRC}/chat/${f}`), `${SRC}/main.js`, `${SRC}/settings/aiSettingsDialog.js`];
  const found = new Set();
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bct\(\s*'((?:[^'\\]|\\.)*)'/g)) if (HEBREW.test(m[1])) found.add(m[1]);
    for (const m of text.matchAll(/\bct\(\s*([^,()]+?)\s*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
      [m[2], m[3]].filter((s) => HEBREW.test(s)).forEach((s) => found.add(s));
    }
  }
  return found;
}

afterEach(() => setChatLanguage('he'));

describe('chat language (ADR-029)', () => {
  it('has a translation in every language for every chat text, with the same placeholders', () => {
    const sources = new Set([
      ...ctLiterals(), NOT_CONNECTED_MESSAGE, AGENT_ERROR_MESSAGE, STALE_MESSAGE, AGENT_NAME, AI_VOICE_DISCLOSURE, SAMPLE_TEXT,
      ...Object.values(VOICE_MESSAGES), ...Object.values(STATUS_LABELS),
    ]);
    const known = new Set(translatedSources());
    const missing = [...sources].filter((s) => !known.has(s));
    expect(missing).toEqual([]);
    for (const source of sources) {
      for (const lang of ['en', 'ru', 'ar']) {
        const text = ct(source, null, lang);
        expect(HEBREW.test(text), `${lang}: ${source}`).toBe(false);
        expect([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()).toEqual([...source.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
      }
    }
  });

  it('switches the session language, tells listeners once, and ignores unknown languages', () => {
    const seen = [];
    const off = onChatLanguage((lang) => seen.push(lang));
    expect(setChatLanguage('ru')).toBe(true);
    expect(setChatLanguage('ru')).toBe(false);
    expect(setChatLanguage('fr')).toBe(false);
    expect(getChatLanguage()).toBe('ru');
    expect(ct('שליחה')).toBe('Отправить');
    expect(ct('{n} שינויים', { n: 3 })).toBe('Изменений: 3');
    expect(speechErrorMessage('PLAYBACK')).toMatch(/Браузер/);
    off();
    setChatLanguage('ar');
    expect(seen).toEqual(['ru']);
    expect([isRtl('he'), isRtl('ar'), isRtl('en'), isRtl('ru')]).toEqual([true, true, false, false]);
  });

  it('keeps Hebrew as is, and leaves an untranslated text in Hebrew rather than empty', () => {
    expect(ct('שליחה')).toBe('שליחה');
    setChatLanguage('en');
    expect(ct('טקסט שאין לו תרגום')).toBe('טקסט שאין לו תרגום');
    expect(ct('{n} שינויים', { n: 2, extra: 'x' })).toBe('2 changes');
  });

  it('remembers the language in this browser and survives tampered or blocked storage', () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    expect(loadChatLanguage(storage)).toBe('he');
    saveChatLanguage('ar', storage);
    expect(loadChatLanguage(storage)).toBe('ar');
    data.set('banai.language', '<script>');
    expect(loadChatLanguage(storage)).toBe('he');
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadChatLanguage(blocked)).toBe('he');
    expect(() => saveChatLanguage('en', blocked)).not.toThrow();
    expect(CHAT_LANGUAGES).toEqual(['he', 'en', 'ru', 'ar']);
  });
});
