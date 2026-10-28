// The private link of a saved design: /#d=<uuid>.<token>. The fragment never reaches a server log or
// a Referer header; only this page reads it and sends the token to the API as a bearer credential.
const LINK = /^#d=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

/** { designId, token } from a location hash, or null when it is not a design link. */
export function parseShareHash(hash) {
  const match = LINK.exec(hash ?? '');
  return match ? { designId: match[1], token: match[2] } : null;
}

export const shareHash = ({ designId, token }) => `#d=${designId}.${token}`;

// Recently saved designs, remembered in this browser only (there are no accounts). Each entry holds the
// link's token, which is the design's only credential: the same secret the browser history already keeps.
// Storage is best effort and untrusted: blocked storage means an empty list, invalid entries are dropped.
export const RECENT_KEY = 'banai.recentDesigns';
export const MAX_RECENT = 5;
const MAX_MM = 100_000;

const isDimension = (value) => Number.isInteger(value) && value > 0 && value <= MAX_MM;

function validEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const { designId, token, savedAt, dimensions } = entry;
  if (typeof designId !== 'string' || typeof token !== 'string') return null;
  if (!parseShareHash(shareHash({ designId, token }))) return null;
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) return null;
  const { width, height, depth } = dimensions ?? {};
  if (![width, height, depth].every(isDimension)) return null;
  return { designId, token, savedAt, dimensions: { width, height, depth } };
}

/** The remembered designs, newest first: [{ designId, token, savedAt, dimensions }]. */
export function readRecent(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = JSON.parse(storage?.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return []; // blocked storage or a corrupted value
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const entries = [];
  for (const item of raw) {
    const entry = validEntry(item);
    if (!entry || seen.has(entry.designId)) continue;
    seen.add(entry.designId);
    entries.push(entry);
    if (entries.length === MAX_RECENT) break;
  }
  return entries;
}

function writeRecent(entries, storage) {
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(entries));
  } catch {
    // not persisted; the design itself is saved on the server
  }
}

/** Put a saved design first in the list (replacing an older entry for the same design). */
export function rememberDesign({ designId, token, dimensions }, { storage = globalThis.localStorage, now = new Date() } = {}) {
  const entry = validEntry({ designId, token, savedAt: now.toISOString(), dimensions });
  if (!entry) return readRecent(storage);
  const entries = [entry, ...readRecent(storage).filter((e) => e.designId !== designId)].slice(0, MAX_RECENT);
  writeRecent(entries, storage);
  return entries;
}

/** Drop a design from the list (the design itself is not deleted). */
export function forgetDesign(designId, storage = globalThis.localStorage) {
  const entries = readRecent(storage).filter((e) => e.designId !== designId);
  writeRecent(entries, storage);
  return entries;
}
