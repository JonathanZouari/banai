// "Last designs": a small archive of designs kept only in this browser (localStorage). No account, no
// server: the list never leaves the device. Storage is untrusted input, because the user, another tab,
// an older version of the app or a browser extension may have changed it. Every call is wrapped so a
// blocked, full or corrupt store degrades to an empty list and never throws.
//
// MAX_ENTRIES and MAX_ENTRY_BYTES are configurable defaults, not business rules.
// Only the design and two timestamps are stored: never a share link or its token.
export const STORAGE_KEY = 'banai.archive.v1';
export const MAX_ENTRIES = 20;
export const MAX_ENTRY_BYTES = 200_000;
const VERSION = 1;
const MAX_ID_LENGTH = 64;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isTimestamp = (value) => Number.isFinite(value) && value > 0;
const isMm = (value) => Number.isInteger(value) && value > 0;

/** A cheap shape check on read. The full design validation runs when an entry is opened. */
export function isEntryShape(entry) {
  if (!isPlainObject(entry)) return false;
  if (typeof entry.id !== 'string' || entry.id.length === 0 || entry.id.length > MAX_ID_LENGTH) return false;
  if (!isTimestamp(entry.createdAt) || !isTimestamp(entry.updatedAt)) return false;
  const { design } = entry;
  if (!isPlainObject(design) || !isPlainObject(design.dimensions)) return false;
  const { width, height, depth } = design.dimensions;
  return isMm(width) && isMm(height) && isMm(depth)
    && Array.isArray(design.compartments) && design.compartments.length > 0
    && isPlainObject(design.doors);
}

const newest = (a, b) => b.updatedAt - a.updatedAt;

function newId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* fall through */ }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * `storage` is injectable for tests. `listen` wires the cross-tab `storage` event; it is skipped where
 * there is no window (tests, node).
 */
export function createLocalArchive({
  storage = globalThis.localStorage, now = Date.now, limit = MAX_ENTRIES, listen = true,
} = {}) {
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());

  /** Entries newest first. Anything unreadable is an empty list; bad single entries are skipped. */
  function readEntries() {
    let raw;
    try { raw = storage?.getItem(STORAGE_KEY); } catch { return []; }
    if (typeof raw !== 'string' || raw === '') return [];
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return []; }
    if (!isPlainObject(parsed) || parsed.version !== VERSION || !Array.isArray(parsed.entries)) return [];
    const seen = new Set();
    return parsed.entries
      .filter((entry) => isEntryShape(entry) && !seen.has(entry.id) && seen.add(entry.id))
      .sort(newest);
  }

  /**
   * Writes the list, newest first. When the browser says it is full, the oldest entry is dropped and the
   * write retried. Returns false when nothing could be stored.
   */
  function writeEntries(entries) {
    const kept = [...entries].sort(newest).slice(0, limit);
    while (true) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, entries: kept }));
        return true;
      } catch {
        if (kept.length <= 1) return false;
        kept.pop();
      }
    }
  }

  if (listen && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', (event) => {
      if (event.key === null || event.key === STORAGE_KEY) notify(); // null: storage was cleared
    });
  }

  return {
    list: readEntries,

    get: (id) => readEntries().find((entry) => entry.id === id) ?? null,

    /** True when this browser lets the site keep data. Checked with a throwaway key, never the archive. */
    isAvailable() {
      try {
        const probe = `${STORAGE_KEY}.probe`;
        storage.setItem(probe, '1');
        storage.removeItem(probe);
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Saves `design` under `id`, or as a new entry when `id` is null or no longer in the list (it was
     * removed, here or in another tab). Re-reads first so another tab's changes are kept.
     * Returns { ok, id }.
     */
    upsert(id, design) {
      let serialized;
      try { serialized = JSON.stringify(design); } catch { return { ok: false, id: null }; }
      if (typeof serialized !== 'string' || serialized.length > MAX_ENTRY_BYTES) return { ok: false, id: null };
      const stamp = now();
      const entries = readEntries();
      const existing = id ? entries.find((entry) => entry.id === id) : null;
      const entry = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
        design: JSON.parse(serialized), // a detached copy: the store's design is frozen
      };
      if (!isEntryShape(entry)) return { ok: false, id: null };
      const ok = writeEntries([entry, ...entries.filter((other) => other.id !== entry.id)]);
      if (ok) notify();
      return { ok, id: ok ? entry.id : null };
    },

    /** Removes one entry. Returns false when it was not in the list. */
    remove(id) {
      const entries = readEntries();
      const rest = entries.filter((entry) => entry.id !== id);
      if (rest.length === entries.length) return false;
      if (!writeEntries(rest)) return false;
      notify();
      return true;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
