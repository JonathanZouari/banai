import { API_BASE_URL } from '../config.js';

/** A failed API call. `status` is the HTTP status (0 for network errors); `code` is the server's error code. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, fetchImpl, init) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  let response;
  try {
    response = await (init ? fetchImpl(`${API_BASE_URL}${path}`, init) : fetchImpl(`${API_BASE_URL}${path}`));
  } catch {
    throw new ApiError('Could not reach the design service.');
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON error pages fall through to the status check below
  }
  if (!response.ok || !body || body.success !== true) {
    const error = body?.success === false && typeof body.error === 'object' ? body.error : null;
    const fallback = response.ok
      ? `Request to ${path} returned an unsuccessful response`
      : `Request to ${path} failed with status ${response.status}`;
    throw new ApiError(error?.message ?? fallback, { status: response.status, code: error?.code ?? 'HTTP_ERROR' });
  }
  return body.data;
}

const getJson = (path, fetchImpl) => request(path, fetchImpl);
const sendJson = (method, path, payload, fetchImpl, headers = {}) => request(path, fetchImpl, {
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(payload),
});
const postJson = (path, payload, fetchImpl) => sendJson('POST', path, payload, fetchImpl);

export const getHealth = (fetchImpl = fetch) => getJson('/api/health', fetchImpl).then((data) => ({ success: true, data }));

export const getCatalog = (fetchImpl = fetch) => getJson('/api/catalog', fetchImpl);

/** Returns { design, revision } for the predefined basic wardrobe. */
export const getDefaultDesign = (fetchImpl = fetch) => getJson('/api/designs/default', fetchImpl);

/** One agent turn: { messages: [{role, text}], design, revision } -> { reply, proposal|null }. */
export const sendChat = (payload, fetchImpl = fetch) => postJson('/api/chat', payload, fetchImpl);

/** Speech to text: a recorded audio Blob -> { text }. `language` only localizes server errors. */
export const transcribe = (blob, language, fetchImpl = fetch) => request(
  `/api/voice/transcribe?language=${encodeURIComponent(language)}`,
  fetchImpl,
  { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' }, body: blob },
);

/** Text to speech: { text, language, signature } -> an audio/mpeg Blob (signature = the chat replySignature). */
export async function fetchSpeech(payload, fetchImpl = fetch) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  let response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/voice/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError('Could not reach the design service.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? `Request to /api/voice/speech failed with status ${response.status}`, {
      status: response.status,
      code: body?.error?.code ?? 'HTTP_ERROR',
    });
  }
  return response.blob();
}

/** Apply a signed proposal: { design, revision, proposal } -> { design, revision }. 409 = stale. */
export const applyProposal = (payload, fetchImpl = fetch) => postJson('/api/proposals/apply', payload, fetchImpl);

const SAFE_PDF_NAME = /^[A-Za-z0-9._-]{1,80}\.pdf$/;
const FALLBACK_PDF_NAME = 'banai-wardrobe.pdf';

function pdfFilename(disposition) {
  const name = /filename="?([^";]+)"?/i.exec(disposition ?? '')?.[1];
  return name && SAFE_PDF_NAME.test(name) ? name : FALLBACK_PDF_NAME;
}

/**
 * The carpenter PDF: { design, language: 'he'|'en', image? } -> { blob, filename }. `image` is the
 * app's own 3D snapshot (a JPEG/PNG data URL); without it the PDF uses its drawn illustration.
 */
export async function exportPdf({ design, language, image = null }, fetchImpl = fetch) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  let response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(image ? { design, language, image } : { design, language }),
    });
  } catch {
    throw new ApiError('Could not reach the design service.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? `Request to /api/export/pdf failed with status ${response.status}`, {
      status: response.status,
      code: body?.error?.code ?? 'HTTP_ERROR',
    });
  }
  if (!(response.headers?.get('Content-Type') ?? '').toLowerCase().startsWith('application/pdf')) {
    throw new ApiError('The service did not return a PDF.', { status: response.status, code: 'BAD_RESPONSE' });
  }
  return { blob: await response.blob(), filename: pdfFilename(response.headers.get('Content-Disposition')) };
}

const designPath = (designId) => `/api/designs/${encodeURIComponent(designId)}`;
// The link token opens a design; the customer's session (a bearer token) is what saving needs.
const designToken = (token) => ({ 'X-Design-Token': token });
const bearer = (accessToken) => ({ Authorization: `Bearer ${accessToken}` });

/** Save a new design (logged in): { design, language, accessToken } -> { designId, accessToken, revision }. The link token is shown only once. */
export const createSavedDesign = ({ accessToken, ...payload }, fetchImpl = fetch) => sendJson(
  'POST', '/api/designs', payload, fetchImpl, bearer(accessToken),
);

/** Reopen a saved design: { designId, token, language } -> { designId, name, design, revision }. 404 = not this link. */
export const getSavedDesign = ({ designId, token, language }, fetchImpl = fetch) => request(
  `${designPath(designId)}?language=${encodeURIComponent(language)}`,
  fetchImpl,
  { headers: designToken(token) },
);

/** Save over a saved design from `revision` (logged in): -> { designId, revision }. 409 STALE = someone saved in between. */
export const updateSavedDesign = ({ designId, token, revision, design, language, accessToken }, fetchImpl = fetch) => sendJson(
  'PUT', designPath(designId), { design, language }, fetchImpl,
  { ...designToken(token), ...bearer(accessToken), 'If-Match': String(revision) },
);

/** Accounts: { email, password, language } -> { user, accessToken, refreshToken, expiresIn, confirmationRequired }. */
export const signUp = (payload, fetchImpl = fetch) => postJson('/api/auth/signup', payload, fetchImpl);

/** { email, password, language } -> { user, accessToken, refreshToken, expiresIn }. 401 = wrong email or password. */
export const logIn = (payload, fetchImpl = fetch) => postJson('/api/auth/login', payload, fetchImpl);

/** { refreshToken, language } -> a new session (the old refresh token stops working). */
export const refreshSession = (payload, fetchImpl = fetch) => postJson('/api/auth/refresh', payload, fetchImpl);

/** Ends the session on the server. */
export const logOut = (accessToken, fetchImpl = fetch) => sendJson('POST', '/api/auth/logout', {}, fetchImpl, bearer(accessToken));
