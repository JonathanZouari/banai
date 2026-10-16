import { API_BASE_URL } from '../config.js';

async function getJson(path, fetchImpl) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const response = await fetchImpl(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  const body = await response.json();
  if (!body || body.success !== true) {
    throw new Error(`Request to ${path} returned an unsuccessful response`);
  }
  return body.data;
}

export const getHealth = (fetchImpl = fetch) => getJson('/api/health', fetchImpl).then((data) => ({ success: true, data }));

export const getCatalog = (fetchImpl = fetch) => getJson('/api/catalog', fetchImpl);

/** Returns { design, revision } for the predefined basic wardrobe. */
export const getDefaultDesign = (fetchImpl = fetch) => getJson('/api/designs/default', fetchImpl);

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function postJson(path, payload, fetchImpl) {
  if (!API_BASE_URL) throw new ApiError(0, 'NO_API', 'The API base URL is not configured');
  let response;
  try {
    response = await fetchImpl(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server.');
  }
  let body = null;
  try {
    body = await response.json();
  } catch { /* non-JSON error body */ }
  if (!response.ok || !body || body.success !== true) {
    throw new ApiError(response.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body.data;
}

/** Returns { reply, proposal | null }. `messages` are { role: 'user' | 'assistant', content }. */
export const postChat = (payload, fetchImpl = fetch) => postJson('/api/chat', payload, fetchImpl);

/** Returns { design, revision }. Throws ApiError (409 STALE, 403 BAD_SIGNATURE, ...). */
export const applyProposal = (payload, fetchImpl = fetch) => postJson('/api/proposals/apply', payload, fetchImpl);
