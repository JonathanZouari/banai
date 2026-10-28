import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyOps } from '../../../src/domain/apply.js';
import { createArchiveRecorder } from '../../../src/archive/recorder.js';
import { createLocalArchive } from '../../../src/archive/localArchive.js';
import { createStore } from '../../../src/state/store.js';
import { loadCatalog, loadDesign } from '../domain/helpers.js';

const catalog = loadCatalog();
const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};
const setup = (options = {}) => {
  const store = createStore({ design: loadDesign('basic'), revision: 1, catalog });
  const archive = createLocalArchive({ storage: options.storage ?? memory(), listen: false });
  const onError = vi.fn();
  const recorder = createArchiveRecorder({ store, archive, delay: 100, onError });
  return { store, archive, recorder, onError };
};
const widen = (store, width) => store.dispatch([{ op: 'update_dimensions', width }]);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('archive recorder', () => {
  it('records nothing for an untouched design', () => {
    const { archive } = setup();
    vi.advanceTimersByTime(5000);
    expect(archive.list()).toEqual([]);
  });

  it('ignores selection and door-view changes', () => {
    const { store, archive } = setup();
    store.select('shf_l1');
    store.setDoorsVisible(false);
    vi.advanceTimersByTime(5000);
    expect(archive.list()).toEqual([]);
  });

  it('records a change after the delay and updates the same entry afterwards', () => {
    const { store, archive } = setup();
    expect(widen(store, 2200).ok).toBe(true);
    expect(archive.list()).toEqual([]); // debounced
    vi.advanceTimersByTime(100);
    expect(archive.list()).toHaveLength(1);
    widen(store, 2300);
    vi.advanceTimersByTime(100);
    expect(archive.list()).toHaveLength(1);
    expect(archive.list()[0].design.dimensions.width).toBe(2300);
  });

  it('writes only once for a burst of changes', () => {
    const { store, archive } = setup();
    const spy = vi.spyOn(archive, 'upsert');
    widen(store, 2200); widen(store, 2210); widen(store, 2220);
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(archive.list()[0].design.dimensions.width).toBe(2220);
  });

  it('flush writes a pending change at once', () => {
    const { store, archive, recorder } = setup();
    widen(store, 2200);
    recorder.flush();
    expect(archive.list()).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(archive.list()).toHaveLength(1);
  });

  it('startNew begins a separate entry and keeps the earlier one', () => {
    const { store, archive, recorder } = setup();
    widen(store, 2200);
    recorder.startNew(); // flushes the pending change first
    widen(store, 2300);
    vi.advanceTimersByTime(100);
    expect(archive.list().map((e) => e.design.dimensions.width).sort()).toEqual([2200, 2300]);
  });

  it('opens an archived design without re-recording it, then updates that entry', () => {
    const { store, archive, recorder } = setup();
    const stored = applyOps(loadDesign('basic'), [{ op: 'update_dimensions', width: 2400 }], catalog);
    const { id } = archive.upsert(null, stored);
    const before = archive.get(id).updatedAt;
    expect(recorder.openArchived(id, archive.get(id).design)).toEqual({ ok: true });
    vi.advanceTimersByTime(1000);
    expect(archive.get(id).updatedAt).toBe(before);
    expect(store.getState().design.dimensions.width).toBe(2400);
    expect(store.canUndo()).toBe(false);
    widen(store, 2500);
    vi.advanceTimersByTime(100);
    expect(archive.list()).toHaveLength(1);
    expect(archive.get(id).design.dimensions.width).toBe(2500);
  });

  it('refuses a stored design that is invalid here and leaves the editor untouched', () => {
    const { store, archive, recorder } = setup();
    const before = store.getState();
    const bad = structuredClone(loadDesign('basic'));
    bad.dimensions.width = 99999999;
    const { id } = archive.upsert(null, bad);
    expect(recorder.openArchived(id, archive.get(id).design)).toEqual({ ok: false });
    expect(store.getState()).toBe(before);
    widen(store, 2200);
    vi.advanceTimersByTime(100);
    expect(archive.list().filter((e) => e.id !== id)).toHaveLength(1); // still recording normally
  });

  it('creates a fresh entry when the open design was removed from the list', () => {
    const { store, archive, recorder } = setup();
    widen(store, 2200);
    recorder.flush();
    const [{ id }] = archive.list();
    archive.remove(id);
    widen(store, 2300);
    vi.advanceTimersByTime(100);
    expect(archive.list()).toHaveLength(1);
    expect(archive.list()[0].id).not.toBe(id);
  });

  it('reports a failing archive once per streak, and again after a success', () => {
    const storage = memory();
    const { store, onError } = setup({ storage });
    const failing = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    widen(store, 2200); vi.advanceTimersByTime(100);
    widen(store, 2300); vi.advanceTimersByTime(100);
    expect(onError).toHaveBeenCalledTimes(1);
    failing.mockRestore();
    widen(store, 2400); vi.advanceTimersByTime(100);
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    widen(store, 2500); vi.advanceTimersByTime(100);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
