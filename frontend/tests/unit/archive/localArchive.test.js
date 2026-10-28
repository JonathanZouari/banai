import { describe, expect, it, vi } from 'vitest';
import { createLocalArchive, isEntryShape, MAX_ENTRY_BYTES, STORAGE_KEY } from '../../../src/archive/localArchive.js';
import { loadDesign } from '../domain/helpers.js';

const design = () => structuredClone(loadDesign('basic'));

function memory({ quota = Infinity } = {}) {
  const data = new Map();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: vi.fn((k, v) => {
      if (String(v).length > quota) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, String(v));
    }),
    removeItem: (k) => data.delete(k),
  };
}
const blocked = () => ({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
});
const make = (storage = memory(), start = 1000) => {
  let clock = start;
  return { storage, archive: createLocalArchive({ storage, now: () => (clock += 1000), listen: false }) };
};

describe('local archive', () => {
  it('starts empty', () => {
    expect(make().archive.list()).toEqual([]);
  });

  it('stores a design with created and updated dates and lists newest first', () => {
    const { archive } = make();
    const a = archive.upsert(null, design());
    const b = archive.upsert(null, design());
    expect(a.ok && b.ok).toBe(true);
    expect(archive.list().map((e) => e.id)).toEqual([b.id, a.id]);
    expect(archive.get(a.id).design.dimensions).toEqual(design().dimensions);
  });

  it('updates an entry in place and keeps its creation date', () => {
    const { archive } = make();
    const { id } = archive.upsert(null, design());
    const created = archive.get(id).createdAt;
    const changed = design();
    changed.dimensions.width = 1800;
    expect(archive.upsert(id, changed).id).toBe(id);
    expect(archive.list()).toHaveLength(1);
    expect(archive.get(id).design.dimensions.width).toBe(1800);
    expect(archive.get(id).createdAt).toBe(created);
    expect(archive.get(id).updatedAt).toBeGreaterThan(created);
  });

  it('creates a fresh entry when the id is no longer in the list', () => {
    const { archive } = make();
    const { id } = archive.upsert(null, design());
    archive.remove(id);
    const again = archive.upsert(id, design());
    expect(again.ok).toBe(true);
    expect(again.id).not.toBe(id);
  });

  it('removes one entry, and removing a missing id is a no-op', () => {
    const { archive } = make();
    const a = archive.upsert(null, design());
    archive.upsert(null, design());
    expect(archive.remove(a.id)).toBe(true);
    expect(archive.remove(a.id)).toBe(false);
    expect(archive.remove('nope')).toBe(false);
    expect(archive.list()).toHaveLength(1);
  });

  it('keeps at most the limit and drops the oldest', () => {
    const storage = memory();
    let t = 0;
    const archive = createLocalArchive({ storage, now: () => (t += 1), limit: 3, listen: false });
    const ids = [1, 2, 3, 4].map(() => archive.upsert(null, design()).id);
    expect(archive.list().map((e) => e.id)).toEqual([ids[3], ids[2], ids[1]]);
  });

  it('notifies subscribers on upsert and remove, and stops after unsubscribe', () => {
    const { archive } = make();
    const listener = vi.fn();
    const off = archive.subscribe(listener);
    const { id } = archive.upsert(null, design());
    archive.remove(id);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    archive.upsert(null, design());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stores a detached copy and no share link or token', () => {
    const { archive, storage } = make();
    const frozen = Object.freeze(design());
    archive.upsert(null, frozen);
    const raw = storage.data.get(STORAGE_KEY);
    expect(JSON.parse(raw).entries[0]).toEqual(expect.objectContaining({ id: expect.any(String), design: expect.any(Object) }));
    expect(raw).not.toMatch(/token|#d=/i);
  });

  describe('untrusted storage', () => {
    const readWith = (value) => {
      const storage = memory();
      storage.data.set(STORAGE_KEY, value);
      return createLocalArchive({ storage, listen: false });
    };

    it.each([
      ['not json', '{oops'],
      ['null', 'null'],
      ['an array', '[]'],
      ['a wrong version', JSON.stringify({ version: 2, entries: [] })],
      ['entries that is not an array', JSON.stringify({ version: 1, entries: {} })],
      ['an empty string', ''],
    ])('treats %s as an empty list without throwing', (_name, value) => {
      const archive = readWith(value);
      expect(archive.list()).toEqual([]);
      expect(archive.get('x')).toBeNull();
      expect(archive.remove('x')).toBe(false);
    });

    it('drops invalid and duplicate entries but keeps the good ones', () => {
      const good = { id: 'a', createdAt: 5, updatedAt: 6, design: design() };
      const archive = readWith(JSON.stringify({
        version: 1,
        entries: [
          good,
          { ...good }, // duplicate id
          { ...good, id: 'b', updatedAt: 'yesterday' },
          { ...good, id: 'c', design: null },
          { ...good, id: 'd', design: { ...design(), dimensions: { width: -1, height: 1, depth: 1 } } },
          { ...good, id: '' },
          'junk',
          null,
        ],
      }));
      expect(archive.list().map((e) => e.id)).toEqual(['a']);
    });

    it('does not trust an entry that is not an object or has absurd ids', () => {
      expect(isEntryShape(undefined)).toBe(false);
      expect(isEntryShape({ id: 'x'.repeat(200), createdAt: 1, updatedAt: 1, design: design() })).toBe(false);
    });

    it('a write after corrupt data replaces it with a valid list', () => {
      const archive = readWith('{oops');
      expect(archive.upsert(null, design()).ok).toBe(true);
      expect(archive.list()).toHaveLength(1);
    });
  });

  describe('storage that fails', () => {
    it('is unavailable and silent when the browser blocks storage', () => {
      const archive = createLocalArchive({ storage: blocked(), listen: false });
      expect(archive.isAvailable()).toBe(false);
      expect(archive.list()).toEqual([]);
      expect(archive.upsert(null, design())).toEqual({ ok: false, id: null });
      expect(archive.remove('x')).toBe(false);
    });

    it('works with no storage object at all', () => {
      const archive = createLocalArchive({ storage: undefined, listen: false });
      expect(archive.isAvailable()).toBe(false);
      expect(archive.list()).toEqual([]);
      expect(archive.upsert(null, design()).ok).toBe(false);
    });

    it('drops the oldest entries when the quota is exceeded, and keeps the newest', () => {
      const one = JSON.stringify({ version: 1, entries: [{ id: 'x'.repeat(36), createdAt: 1000, updatedAt: 1000, design: design() }] }).length;
      const storage = memory({ quota: Math.floor(one * 2.5) });
      let t = 0;
      const archive = createLocalArchive({ storage, now: () => (t += 1000), listen: false });
      const ids = [0, 1, 2, 3].map(() => archive.upsert(null, design()).id);
      const kept = archive.list().map((e) => e.id);
      expect(kept.length).toBeLessThan(4);
      expect(kept[0]).toBe(ids[3]);
    });

    it('reports failure when even one entry does not fit', () => {
      const storage = memory({ quota: 10 });
      const archive = createLocalArchive({ storage, listen: false });
      expect(archive.upsert(null, design())).toEqual({ ok: false, id: null });
    });

    it('refuses a design larger than the per-entry limit', () => {
      const { archive } = make();
      const huge = design();
      huge.note = 'x'.repeat(MAX_ENTRY_BYTES + 1);
      expect(archive.upsert(null, huge)).toEqual({ ok: false, id: null });
    });
  });

  it('keeps entries written by another tab when this tab writes', () => {
    const storage = memory();
    const tabA = createLocalArchive({ storage, listen: false });
    const tabB = createLocalArchive({ storage, listen: false });
    const a = tabA.upsert(null, design());
    const b = tabB.upsert(null, design());
    expect(new Set(tabA.list().map((e) => e.id))).toEqual(new Set([a.id, b.id]));
  });

  it('notifies on the cross-tab storage event for its key or a clear, and ignores other keys', () => {
    const listeners = {};
    const original = globalThis.addEventListener;
    globalThis.addEventListener = (type, fn) => { listeners[type] = fn; };
    try {
      const archive = createLocalArchive({ storage: memory() });
      const spy = vi.fn();
      archive.subscribe(spy);
      listeners.storage({ key: 'other' });
      expect(spy).not.toHaveBeenCalled();
      listeners.storage({ key: STORAGE_KEY });
      listeners.storage({ key: null });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      if (original) globalThis.addEventListener = original; else delete globalThis.addEventListener;
    }
  });
});
