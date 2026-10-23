// Projects kept on the server and shared by a link (ADR-042). No account: the link carries a secret token,
// `#d=<id>.<token>`, and whoever holds it may open and change the project. The token lives in the address
// (after the #, which a browser never sends to any server), and in this browser next to a locally saved
// project. The backend keeps only a hash of it. Every call goes through the backend; nothing talks to the
// database from here.
import { API_BASE_URL } from '../config.js';
import { getHealth } from '../api/client.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** `{ id, token }` from a `#d=<id>.<token>` address fragment, or null. */
export function parseShareHash(hash) {
  const found = /^#d=([^.]+)\.([^.]+)$/.exec(String(hash ?? ''));
  return found && UUID.test(found[1]) && TOKEN.test(found[2]) ? { id: found[1], token: found[2] } : null;
}

export const shareHash = ({ id, token }) => `#d=${id}.${token}`;

/** A remote reference as kept in this browser: a valid id, token and revision, or null. */
export function storedRemote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, token, revision } = raw;
  return UUID.test(id) && TOKEN.test(token) && Number.isInteger(revision) && revision >= 1 ? { id, token, revision } : null;
}

async function request(method, path, { payload, token, revision, fetchImpl = fetch } = {}) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const headers = {};
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (revision !== undefined) headers['If-Match'] = String(revision);
  const response = await fetchImpl(`${API_BASE_URL}${path}`, {
    method, headers, cache: 'no-store', ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success !== true) {
    const error = new Error(body?.error?.message ?? `Request to ${path} failed with status ${response.status}`);
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return body.data;
}

const bodyOf = ({ name, design, customer }) => ({ name, design, ...(customer ? { customer } : {}) });

/** Store a new project. Returns { id, token, revision }; the token is shown only this once. */
export const createRemote = (project, fetchImpl) => request('POST', '/api/projects', { payload: bodyOf(project), fetchImpl });

/** Open a project. Returns { id, name, design, customer, revision }. */
export const openRemote = ({ id, token }, fetchImpl) => request('GET', `/api/projects/${id}`, { token, fetchImpl });

/** Save over the revision you started from. Returns { revision }; a project that moved on is code STALE. */
export const saveRemote = ({ id, token, revision }, project, fetchImpl) =>
  request('PUT', `/api/projects/${id}`, { payload: bodyOf(project), token, revision, fetchImpl });

export const deleteRemote = ({ id, token }, fetchImpl) => request('DELETE', `/api/projects/${id}`, { token, fetchImpl });

/** Whether this server can keep projects (it says so on /api/health). */
export const storageAvailable = () => getHealth().then((result) => result.data?.storage === true, () => false);

/** The calls the projects dialog uses; a test passes its own. */
export const remoteApi = Object.freeze({ create: createRemote, open: openRemote, save: saveRemote, remove: deleteRemote, available: storageAvailable });
