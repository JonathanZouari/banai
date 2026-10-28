import { describe, expect, it, vi } from 'vitest';
import { createThumbnailQueue, hashText, SLOW_RENDER_MS, withoutDoors } from '../../../src/entry/thumbnails.js';
import { loadDesign } from '../domain/helpers.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
};

/** A queue whose idle callbacks run only when the test says so. */
function setup({ render = vi.fn((design) => `data:${design.dimensions.width}`), storage = memoryStorage(), durations = [] } = {}) {
  const idles = [];
  let clock = 0;
  const queue = createThumbnailQueue({
    catalog: { colors: [] },
    storage,
    render: (design) => {
      const url = render(design);
      clock += durations.shift() ?? 100;
      return url;
    },
    idle: (callback) => idles.push(callback),
    now: () => clock,
  });
  const tick = () => idles.shift()?.();
  return { queue, render, storage, tick, idles };
}

const design = loadDesign('basic');
const kids = loadDesign('template_kids');

describe('thumbnail queue', () => {
  it('renders one picture per idle moment, in request order, and caches it', () => {
    const { queue, render, storage, tick, idles } = setup();
    const ready = [];
    queue.request('basic.front', design, { onReady: (url) => ready.push(url) });
    queue.request('kids.front', kids, { onReady: (url) => ready.push(url) });
    expect(render).not.toHaveBeenCalled(); // nothing blocks the first paint
    tick();
    expect(ready).toEqual(['data:2000']);
    expect(idles).toHaveLength(1); // the next one waits for its own idle moment
    tick();
    expect(ready).toEqual(['data:2000', 'data:1000']);
    expect(storage.data.size).toBe(2);
  });

  it('a cached picture is ready at once, without rendering', () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.queue.request('basic.front', design, { onReady: () => {} });
    first.tick();
    const second = setup({ storage });
    const onReady = vi.fn();
    second.queue.request('basic.front', design, { onReady });
    expect(onReady).toHaveBeenCalledWith('data:2000');
    expect(second.render).not.toHaveBeenCalled();
  });

  it('a changed design is a different cache entry', () => {
    const { queue, tick, storage } = setup();
    queue.request('basic.front', design, { onReady: () => {} });
    tick();
    queue.request('basic.front', { ...design, dimensions: { ...design.dimensions, width: 2100 } }, { onReady: () => {} });
    tick();
    expect(storage.data.size).toBe(2);
  });

  it('without WebGL every card keeps its drawn view (onFail), and nothing else renders', () => {
    const render = vi.fn(() => { throw new Error('no WebGL'); });
    const { queue, tick } = setup({ render });
    const failed = [];
    queue.request('basic.front', design, { onReady: () => {}, onFail: () => failed.push('basic') });
    queue.request('kids.front', kids, { onReady: () => {}, onFail: () => failed.push('kids') });
    tick();
    expect(failed).toEqual(['basic', 'kids']);
    queue.request('later', design, { onReady: () => {}, onFail: () => failed.push('later') });
    expect(failed).toContain('later');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('a picture slower than the budget stops further rendering on this device', () => {
    const { queue, tick, render } = setup({ durations: [SLOW_RENDER_MS + 1] });
    const onFail = vi.fn();
    queue.request('basic.front', design, { onReady: () => {} });
    queue.request('kids.front', kids, { onReady: () => {}, onFail });
    tick();
    expect(onFail).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it('cancel stops rendering when the start screen closes', () => {
    const { queue, tick, render } = setup();
    queue.request('basic.front', design, { onReady: () => {} });
    queue.cancel();
    tick();
    expect(render).not.toHaveBeenCalled();
  });

  it('blocked storage is not an error', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const { queue, tick } = setup({ storage });
    const onReady = vi.fn();
    queue.request('basic.front', design, { onReady });
    tick();
    expect(onReady).toHaveBeenCalledWith('data:2000');
  });
});

describe('helpers', () => {
  it('withoutDoors takes the doors off a copy only', () => {
    const open = withoutDoors(design);
    expect(open.doors).toMatchObject({ type: 'none', items: [] });
    expect(design.doors.type).toBe('hinged');
  });

  it('hashText is stable and short', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
    expect(hashText(JSON.stringify(design)).length).toBeLessThanOrEqual(7);
  });
});
