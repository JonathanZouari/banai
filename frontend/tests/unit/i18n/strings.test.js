import { describe, expect, it, vi } from 'vitest';
import { createLanguage, errorMessage, LANGUAGES, STRINGS, translate } from '../../../src/i18n/strings.js';
import { createChatModel } from '../../../src/chat/chatModel.js';
import { describeOps } from '../../../src/chat/describeOps.js';

const memory = (initial) => {
  const data = new Map(initial ? [['banai.language', initial]] : []);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('strings', () => {
  it('supports exactly English and Hebrew with identical keys', () => {
    expect(LANGUAGES).toEqual(['en', 'he']);
    expect(Object.keys(STRINGS.he).sort()).toEqual(Object.keys(STRINGS.en).sort());
    expect(STRINGS.he.suggestions).toHaveLength(STRINGS.en.suggestions.length);
  });

  it('falls back to English for an unknown language or key', () => {
    expect(translate('ru', 'confirm')).toBe('Confirm');
    expect(translate('he', 'confirm')).toBe('אישור');
    expect(translate('he', 'nope')).toBeUndefined();
  });

  it('maps API error codes to localized text, never the server message', () => {
    expect(errorMessage('he', { code: 'AGENT_BUSY', message: 'English from server' })).toBe(STRINGS.he.errBusy);
    expect(errorMessage('en', { code: 'AGENT_TIMEOUT' })).toBe(STRINGS.en.errTimeout);
    expect(errorMessage('he', new Error('x'))).toBe(STRINGS.he.unavailable);
  });
});

describe('language store', () => {
  it('defaults to English, accepts only en/he and persists the choice', () => {
    const storage = memory();
    const language = createLanguage(storage);
    const seen = vi.fn();
    language.subscribe(seen);
    expect(language.get()).toBe('en');
    expect(language.dir()).toBe('ltr');
    expect(language.set('ru')).toBe(false);
    expect(language.set('he')).toBe(true);
    expect(language.get()).toBe('he');
    expect(language.dir()).toBe('rtl');
    expect(seen).toHaveBeenCalledOnce();
    expect(createLanguage(storage).get()).toBe('he');
  });

  it('ignores a stored value that is not supported and a storage that throws', () => {
    expect(createLanguage(memory('ru')).get()).toBe('en');
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const language = createLanguage(broken);
    expect(language.get()).toBe('en');
    expect(language.set('he')).toBe(true);
    expect(language.get()).toBe('he');
  });
});

describe('localized chat model and ops', () => {
  it('shows system notes and error texts in the selected language', async () => {
    const language = createLanguage(memory('he'));
    const agent = async () => { throw Object.assign(new Error('x'), { code: 'AGENT_BUSY' }); };
    const model = createChatModel({ getRevision: () => 1, getDesign: () => ({}), agent, language });
    model.send('שלום');
    await flush();
    expect(model.getMessages().at(-1).text).toBe(STRINGS.he.errBusy);
    model.setProposal({ id: 's', baseRevision: 1, summary: 'x', changes: [] });
    model.cancelProposal();
    expect(model.getMessages().at(-1).text).toBe(STRINGS.he.cancelled);
  });

  it('describes ops in Hebrew', () => {
    const [change] = describeOps([{ op: 'update_dimensions', width: 2400 }], 'he');
    expect(change).toEqual({ title: 'מידות', detail: 'רוחב 240 ס״מ' });
    expect(describeOps([{ op: 'update_dimensions', width: 2400 }])[0].title).toBe('Dimensions');
  });
});
