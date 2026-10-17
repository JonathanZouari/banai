import { describe, expect, it, vi } from 'vitest';
import { createAdvisoryFeed } from '../../../src/advice/advisoryFeed.js';
import { countLevels } from '../../../src/advice/advisoryPanel.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const calls = [];
  const fetchAdvisories = vi.fn((design, { signal }) => {
    const d = deferred();
    calls.push({ design, signal, ...d });
    return d.promise;
  });
  const timers = [];
  const schedule = vi.fn((fn) => { timers.push(fn); return timers.length; });
  const cancel = vi.fn((id) => { timers[id - 1] = null; });
  const fire = () => { const pending = timers.splice(0); pending.forEach((fn) => fn?.()); };
  const feed = createAdvisoryFeed({ fetchAdvisories, schedule, cancel });
  return { feed, calls, fire, fetchAdvisories };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const A = { id: 'a' };
const B = { id: 'b' };

describe('advisory feed (ADR-018)', () => {
  it('debounces design changes into one request', async () => {
    const { feed, calls, fire } = setup();
    feed.update(A);
    feed.update(B);
    expect(calls).toHaveLength(0);
    expect(feed.getState()).toMatchObject({ status: 'loading', stale: true });
    fire();
    expect(calls).toHaveLength(1);
    expect(calls[0].design).toBe(B);
    calls[0].resolve([{ id: 'r2-board', level: 'info' }]);
    await tick();
    expect(feed.getState()).toMatchObject({ status: 'ready', stale: false, items: [{ id: 'r2-board' }] });
  });

  it('ignores the same design object', () => {
    const { feed, fire, calls } = setup();
    feed.update(A);
    fire();
    feed.update(A);
    fire();
    expect(calls).toHaveLength(1);
  });

  it('aborts the request a newer design replaced and drops its late answer', async () => {
    const { feed, calls, fire } = setup();
    feed.update(A);
    fire();
    feed.update(B);
    fire();
    expect(calls[0].signal.aborted).toBe(true);
    calls[1].resolve([{ id: 'new' }]);
    calls[0].resolve([{ id: 'old' }]);
    await tick();
    expect(feed.getState().items).toEqual([{ id: 'new' }]);
  });

  it('stays stale from a design change until its own answer arrives', async () => {
    const { feed, calls, fire } = setup();
    feed.update(A);
    fire();
    calls[0].resolve([{ id: 'x' }]);
    await tick();
    feed.update(B);
    expect(feed.getState()).toMatchObject({ stale: true, status: 'ready', items: [{ id: 'x' }] });
  });

  it('reports an error, keeps the old items stale, and retries', async () => {
    const { feed, calls, fire } = setup();
    feed.update(A);
    fire();
    calls[0].resolve([{ id: 'x' }]);
    await tick();
    feed.update(B);
    fire();
    calls[1].reject(new Error('offline'));
    await tick();
    expect(feed.getState()).toMatchObject({ status: 'error', stale: true, items: [{ id: 'x' }] });
    feed.retry();
    expect(calls[2].design).toBe(B);
    calls[2].resolve([]);
    await tick();
    expect(feed.getState()).toMatchObject({ status: 'ready', stale: false, items: [] });
  });

  it('an abort is not an error', async () => {
    const { feed, calls, fire } = setup();
    feed.update(A);
    fire();
    feed.update(B);
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    calls[0].reject(abort);
    await tick();
    expect(feed.getState().status).toBe('loading');
  });
});

describe('countLevels', () => {
  it('counts each level', () => {
    expect(countLevels([{ level: 'warn' }, { level: 'info' }, { level: 'warn' }])).toEqual({ critical: 0, warn: 2, info: 1 });
  });
});
