// Projects kept in this browser: save the current design under a name, open a saved one, start a new one,
// and move a project between browsers as a file. No account and no server: the list lives in localStorage
// and never leaves the browser. A project may carry the customer's details (ADR-038, share/customer.js). Storage can be blocked, full or edited by hand, so every read is checked
// and a design is validated by the engine before it is opened (the store does that). Pure: storage, the
// clock and ids are injected, so it is unit-tested.

import { storedCustomer } from './customer.js';
import { storedRemote } from './remote.js';

export const PROJECTS_KEY = 'banai.projects.v1';
export const MAX_PROJECTS = 30;
export const MAX_NAME = 60;
export const MAX_FILE_BYTES = 1024 * 1024; // a design is a few KB; anything this large is not ours
export const DEFAULT_NAME = 'ארון ללא שם';
export const FILE_APP = 'banai';
const ID = /^[a-z0-9-]{8,64}$/i;

/** A project name as stored: trimmed, single-spaced, at most MAX_NAME characters, never empty. */
export function cleanName(raw) {
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  return name.slice(0, MAX_NAME) || DEFAULT_NAME;
}

const isEntry = (p) => p && typeof p === 'object' && typeof p.id === 'string' && ID.test(p.id)
  && typeof p.name === 'string' && typeof p.savedAt === 'string' && p.design && typeof p.design === 'object';

export function createProjectStore({
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
  newId = () => globalThis.crypto.randomUUID(),
} = {}) {
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(PROJECTS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_PROJECTS) : [];
    } catch {
      return []; // blocked or damaged storage: no projects, never a crash
    }
  };
  const write = (projects) => {
    try {
      storage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'storage' }; // blocked, or full
    }
  };

  return {
    /** Saved projects, newest first: { id, name, savedAt }. */
    list() {
      return read().map(({ id, name, savedAt }) => ({ id, name: cleanName(name), savedAt })).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    },
    /** The saved design of a project, or null. */
    get(id) {
      return read().find((p) => p.id === id)?.design ?? null;
    },
    /** A saved project's design and customer details (null when none, or not valid any more), or null. */
    entry(id) {
      const found = read().find((p) => p.id === id);
      return found ? { design: found.design, customer: storedCustomer(found.customer), remote: storedRemote(found.remote) } : null;
    },
    /** Save a design: a new project, or over `id`. Returns { ok, id } or { ok: false, reason: 'full' | 'storage' }. */
    save({ id = null, name, design, customer = null, remote = null }) {
      const projects = read();
      const entry = { id: id && ID.test(id) ? id : newId(), name: cleanName(name), savedAt: now(), design };
      const details = storedCustomer(customer);
      if (details) entry.customer = details;
      const link = storedRemote(remote); // the project's place on the server, so it can be saved there again
      if (link) entry.remote = link;
      const index = projects.findIndex((p) => p.id === entry.id);
      if (index >= 0) projects[index] = entry;
      else if (projects.length >= MAX_PROJECTS) return { ok: false, reason: 'full' };
      else projects.push(entry);
      const written = write(projects);
      return written.ok ? { ok: true, id: entry.id, name: entry.name } : written;
    },
    remove(id) {
      return write(read().filter((p) => p.id !== id));
    },
  };
}

/** A project as a file: JSON text with the app's tag, so an unrelated file is refused on import. */
export function projectFile({ name, design, customer = null }) {
  const details = storedCustomer(customer);
  return JSON.stringify({ app: FILE_APP, version: 1, name: cleanName(name), design, ...(details ? { customer: details } : {}) }, null, 2);
}

/**
 * Read a project file. Returns { ok: true, name, design, customer } (the design still has to pass the engine) or
 * { ok: false, reason: 'size' | 'format' }.
 */
export function readProjectFile(text) {
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) return { ok: false, reason: 'size' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (!data || data.app !== FILE_APP || data.version !== 1 || !data.design || typeof data.design !== 'object') {
    return { ok: false, reason: 'format' };
  }
  return { ok: true, name: cleanName(data.name), design: data.design, customer: storedCustomer(data.customer) };
}

/** A safe file name for a project ("ארון חדר שינה.banai.json"). */
export function fileName(name) {
  const base = cleanName(name).replace(/[\\/:*?"<>|]/g, '').trim() || DEFAULT_NAME;
  return `${base}.banai.json`;
}
