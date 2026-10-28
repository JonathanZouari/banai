import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT, RECENT_KEY, forgetDesign, parseShareHash, readRecent, rememberDesign, shareHash,
} from '../../../src/share/link.js';

const designId = '0b6f2a52-3c1e-4c8e-9a51-1f6f3f2b7d10';
const token = 'A'.repeat(40) + '_-9';

describe('share link', () => {
  it('round-trips a design id and token through the hash', () => {
    expect(parseShareHash(shareHash({ designId, token }))).toEqual({ designId, token });
  });

  it.each([
    ['', 'empty'],
    [`#d=${designId}`, 'no token'],
    [`#d=${designId}.short`, 'short token'],
    [`#d=not-a-uuid.${token}`, 'bad id'],
    [`#d=${designId}.${token}&x=1`, 'trailing data'],
    [`#x=${designId}.${token}`, 'other key'],
  ])('rejects %s (%s)', (hash) => {
    expect(parseShareHash(hash)).toBeNull();
  });
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    raw: () => data.get(RECENT_KEY),
  };
}

const idOf = (n) => `0b6f2a52-3c1e-4c8e-9a51-${String(n).padStart(12, '0')}`;
const dims = { width: 2000, height: 2400, depth: 600 };
const at = (minute) => ({ now: new Date(Date.UTC(2026, 9, 28, 12, minute)) });

describe('recent designs', () => {
  it('starts empty and remembers a saved design with its date and dimensions', () => {
    const storage = memoryStorage();
    expect(readRecent(storage)).toEqual([]);
    rememberDesign({ designId, token, dimensions: dims }, { storage, ...at(0) });
    expect(readRecent(storage)).toEqual([
      { designId, token, savedAt: '2026-10-28T12:00:00.000Z', dimensions: dims },
    ]);
  });

  it('lists the newest first, keeps one entry per design and at most five', () => {
    const storage = memoryStorage();
    for (let n = 1; n <= 6; n += 1) rememberDesign({ designId: idOf(n), token, dimensions: dims }, { storage, ...at(n) });
    rememberDesign({ designId: idOf(3), token, dimensions: { ...dims, height: 2200 } }, { storage, ...at(10) });
    const list = readRecent(storage);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list.map((e) => e.designId)).toEqual([idOf(3), idOf(6), idOf(5), idOf(4), idOf(2)]);
    expect(list[0].dimensions.height).toBe(2200);
  });

  it('forgets a design without touching the others', () => {
    const storage = memoryStorage();
    rememberDesign({ designId: idOf(1), token, dimensions: dims }, { storage, ...at(1) });
    rememberDesign({ designId: idOf(2), token, dimensions: dims }, { storage, ...at(2) });
    forgetDesign(idOf(2), storage);
    expect(readRecent(storage).map((e) => e.designId)).toEqual([idOf(1)]);
  });

  it('drops tampered or malformed entries and ignores a corrupted value', () => {
    const good = { designId, token, savedAt: '2026-10-28T12:00:00.000Z', dimensions: dims };
    const storage = memoryStorage({
      [RECENT_KEY]: JSON.stringify([
        { ...good, token: 'short' },
        { ...good, designId: 'javascript:alert(1)' },
        { ...good, savedAt: 'yesterday' },
        { ...good, dimensions: { ...dims, width: -1 } },
        { ...good, dimensions: { ...dims, depth: 1.5 } },
        null,
        'text',
        good,
        { ...good },
      ]),
    });
    expect(readRecent(storage)).toEqual([good]);
    expect(readRecent(memoryStorage({ [RECENT_KEY]: '{not json' }))).toEqual([]);
    expect(readRecent(memoryStorage({ [RECENT_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it('does not remember an invalid design link', () => {
    const storage = memoryStorage();
    rememberDesign({ designId: 'nope', token, dimensions: dims }, { storage });
    expect(storage.raw()).toBeUndefined();
  });

  it('works without storage (blocked or private mode)', () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readRecent(blocked)).toEqual([]);
    expect(() => rememberDesign({ designId, token, dimensions: dims }, { storage: blocked })).not.toThrow();
    expect(() => forgetDesign(designId, blocked)).not.toThrow();
    expect(readRecent(undefined)).toEqual([]);
  });
});
