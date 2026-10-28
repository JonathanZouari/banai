// Start-screen thumbnails: real pictures of each template from the app's own engine
// (renderSnapshot, opt-in thumbnail mode). Rendering blocks the main thread, so it is gentle:
// one picture at a time, only when the browser is idle, front views first, then the "inside"
// views (the same wardrobe without doors). Results are cached per browser, so later visits are
// instant. If WebGL is missing, or one picture is too slow for this device, rendering stops and
// the cards keep their drawn front view (see elevation.js).
import { renderSnapshot } from '../viewer/snapshot.js';

export const THUMBNAIL_SIZE = Object.freeze({ width: 400, height: 434 });
export const SLOW_RENDER_MS = 2500;
const CACHE_PREFIX = 'banai.thumb.v1.';

/** FNV-1a: a short, stable key for a design (and the catalog colours it is drawn with). */
export function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The same wardrobe with its doors taken off, for the "inside" view. */
export const withoutDoors = (design) => ({ ...design, doors: { ...design.doors, type: 'none', items: [] } });

const whenIdle = (callback) => (globalThis.requestIdleCallback
  ? globalThis.requestIdleCallback(callback, { timeout: 1500 })
  : setTimeout(callback, 50));

/**
 * request(key, design, { onReady(url), onFail() }) queues one picture. Everything is injectable for tests.
 * Returns { request, cancel }.
 */
export function createThumbnailQueue({
  catalog,
  storage = globalThis.localStorage,
  render = (design) => renderSnapshot(design, catalog, { ...THUMBNAIL_SIZE, thumbnail: true }),
  idle = whenIdle,
  now = () => performance.now(),
} = {}) {
  const pending = [];
  let running = false;
  let stopped = false; // cancelled, or this device cannot render (fast enough)
  const palette = hashText(JSON.stringify(catalog?.colors ?? []));

  const cacheKey = (key, design) => `${CACHE_PREFIX}${key}.${hashText(JSON.stringify(design))}${palette}`;
  const read = (name) => {
    try {
      return storage?.getItem(name) ?? null;
    } catch {
      return null; // blocked storage: just render
    }
  };
  const write = (name, url) => {
    try {
      storage?.setItem(name, url);
    } catch {
      // full or blocked storage: the picture still shows this time
    }
  };

  const giveUp = () => {
    stopped = true;
    pending.splice(0).forEach((task) => task.onFail?.());
  };

  function next() {
    if (stopped || pending.length === 0) {
      running = false;
      return;
    }
    running = true;
    idle(() => {
      if (stopped) {
        running = false;
        return;
      }
      const task = pending.shift();
      const started = now();
      let url;
      try {
        url = render(task.design);
      } catch {
        task.onFail?.();
        giveUp(); // no WebGL: nothing else will render either
        running = false;
        return;
      }
      write(task.cacheName, url);
      task.onReady(url);
      if (now() - started > SLOW_RENDER_MS) {
        giveUp(); // too slow for this device: keep the drawn views
        running = false;
        return;
      }
      next();
    });
  }

  return {
    request(key, design, { onReady, onFail } = {}) {
      const cacheName = cacheKey(key, design);
      const cached = read(cacheName);
      if (cached) {
        onReady(cached);
        return;
      }
      if (stopped) {
        onFail?.();
        return;
      }
      pending.push({ cacheName, design, onReady, onFail });
      if (!running) next();
    },
    /** The start screen closed: stop rendering (already cached pictures stay cached). */
    cancel() {
      stopped = true;
      pending.length = 0;
    },
  };
}
