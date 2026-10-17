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

/**
 * Checks an OpenAI key with the backend, which calls OpenAI once and stores nothing.
 * Returns { status, model, maskedKey, checkedAt }. Errors carry the envelope's `code`.
 */
export const verifyAiKey = (apiKey, fetchImpl = fetch) => postJson('/api/settings/ai/verify', { apiKey }, fetchImpl);

/** One agent turn. `messages` is [{ role: 'user'|'assistant', content }]. Returns { reply, model }. */
export const sendChatMessage = (apiKey, messages, fetchImpl = fetch) => postJson('/api/chat', { apiKey, messages }, fetchImpl);

/**
 * Research-backed advisories for a design (ADR-018). Returns [{ id, level, title, body, grade, src,
 * targets, fix?: { label, ops } }], most severe first. `signal` cancels a request a newer design replaced.
 */
export const getAdvisories = (design, { signal, fetchImpl = fetch } = {}) =>
  postJson('/api/advisories', { design }, fetchImpl, signal).then((data) => data.advisories);

/**
 * The carpenter dossier PDF (ADR-019) as a Blob. `renderPng` (optional) is the path-traced cover,
 * a PNG data URL or bare base64. Errors carry the envelope's `code` (422 invalid design, 413, 429).
 */
export async function getDossier(design, { renderPng = null, fetchImpl = fetch } = {}) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const png = renderPng ? renderPng.replace(/^data:image\/png;base64,/, '') : null;
  const response = await fetchImpl(`${API_BASE_URL}/api/dossier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(png ? { design, renderPng: png } : { design }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.message ?? `Request to /api/dossier failed with status ${response.status}`);
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return response.blob();
}

async function postJson(path, payload, fetchImpl, signal = undefined) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const response = await fetchImpl(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success !== true) {
    const error = new Error(body?.error?.message ?? `Request to ${path} failed with status ${response.status}`);
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return body.data;
}
