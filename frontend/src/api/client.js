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

/**
 * One agent turn. `messages` is [{ role: 'user'|'assistant', content }]. With `context` ({ design, revision })
 * the agent sees the design and may return a signed proposal. `context.spoken`: the customer spoke and
 * will hear the reply, so the agent answers for the ear (ADR-028). Returns { reply, model, proposal?, sources? }:
 * `sources` are the web pages a reply cites, [{ title, url }] (ADR-036).
 */
export const sendChatMessage = (apiKey, messages, context = null, fetchImpl = fetch) => {
  const body = context?.design ? { apiKey, messages, design: context.design, revision: context.revision } : { apiKey, messages };
  if (context?.spoken) body.spoken = true;
  if (context?.language) body.language = context.language; // the session language (ADR-029)
  return postJson('/api/chat', body, fetchImpl);
};

/**
 * Apply a signed proposal the customer confirmed (ADR-020). Returns { design, revision }. A design that
 * changed since the proposal is a 409 with code STALE.
 */
export const applyProposal = (design, revision, proposal, fetchImpl = fetch) =>
  postJson('/api/proposals/apply', { design, revision, proposal }, fetchImpl);

/**
 * Push-to-talk speech to text. The key and the recording go as multipart form fields (never in the URL);
 * the backend hands both to OpenAI and keeps neither. Returns the transcript, which may be empty.
 * Errors carry the envelope's `code` (400 INVALID_FORMAT/EMPTY_AUDIO, 413, 415, 429 BUSY, OpenAI's codes).
 */
export async function transcribeAudio(apiKey, blob, { fetchImpl = fetch, language = null } = {}) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const form = new FormData();
  form.append('apiKey', apiKey);
  form.append('audio', blob, 'voice');
  if (language) form.append('language', language); // a hint for the model (ADR-029)
  const response = await fetchImpl(`${API_BASE_URL}/api/voice/transcribe`, { method: 'POST', body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success !== true) {
    const error = new Error(body?.error?.message ?? `Request to /api/voice/transcribe failed with status ${response.status}`);
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return String(body.data?.text ?? '');
}

/**
 * A reply read aloud (ADR-028): MP3 from the server, made with the customer's key and an AI voice.
 * The key goes in the JSON body, never in the URL. Errors carry the envelope's `code`.
 */
export async function synthesizeSpeech(apiKey, text, voice, { fetchImpl = fetch, signal } = {}) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const response = await fetchImpl(`${API_BASE_URL}/api/voice/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: apiKey ?? '', text, ...(voice ? { voice } : {}) }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error?.message ?? `Request to /api/voice/speak failed with status ${response.status}`);
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return response.blob();
}

/**
 * Research-backed advisories for a design (ADR-018). Returns [{ id, level, title, body, grade, src,
 * targets, fix?: { label, ops } }], most severe first. `signal` cancels a request a newer design replaced.
 */
export const getAdvisories = (design, { signal, fetchImpl = fetch } = {}) =>
  postJson('/api/advisories', { design }, fetchImpl, signal).then((data) => data.advisories);

/**
 * The carpenter dossier PDF (ADR-019) as a Blob. `renderPng` (optional) is the path-traced cover,
 * a PNG data URL or bare base64. `language` is the carpenter's: he | en | ru | ar (ADR-029).
 * Errors carry the envelope's `code` (422 invalid design, 413, 429).
 */
export async function getDossier(design, { renderPng = null, language = 'he', customer = null, fetchImpl = fetch } = {}) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  const png = renderPng ? renderPng.replace(/^data:image\/png;base64,/, '') : null;
  const response = await fetchImpl(`${API_BASE_URL}/api/dossier`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The customer's details (ADR-038) go with the dossier request only, for that PDF.
    body: JSON.stringify({ design, ...(png ? { renderPng: png } : {}), ...(language !== 'he' ? { language } : {}), ...(customer ? { customer } : {}) }),
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
