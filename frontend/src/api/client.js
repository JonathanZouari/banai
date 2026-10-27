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

/**
 * One agent turn: { messages: [{role, text}], design, revision, language, units }
 * -> { reply, replySignature, proposal|null, offerProfile }.
 */
export const postChat = (payload, fetchImpl = fetch) => postJson('/api/chat', payload, fetchImpl);

/** Apply a signed proposal: { design, revision, proposal, language } -> { design, revision }. 409 = stale. */
export const applyProposal = (payload, fetchImpl = fetch) => postJson('/api/proposals/apply', payload, fetchImpl);

/** Voice feature flag from the server: { enabled, maxSeconds }. */
export const getVoiceStatus = (fetchImpl = fetch) => getJson('/api/voice/status', fetchImpl);

/**
 * Speech to text: a recorded audio Blob -> { text, noSpeech }. `language` only localizes server errors.
 * Silence is not an error for the voice UI: the server's NO_SPEECH becomes { text: '', noSpeech: true }.
 */
export async function transcribeAudio(blob, language, fetchImpl = fetch) {
  try {
    const { text } = await request(
      `/api/voice/transcribe?language=${encodeURIComponent(language)}`,
      fetchImpl,
      { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' }, body: blob },
    );
    return { text, noSpeech: !text };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NO_SPEECH') return { text: '', noSpeech: true };
    throw error;
  }
}

/**
 * Text to speech for one piece of a signed agent reply: { text, signature, piece, language } -> the fetch
 * Response whose body streams raw 24 kHz 16-bit mono PCM. `signature` is the chat replySignature.
 */
export async function speak({ text, signature, piece, language }, fetchImpl = fetch) {
  if (!API_BASE_URL) throw new Error('The API base URL is not configured');
  let response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/voice/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, signature, piece, language }),
    });
  } catch {
    throw new ApiError('Could not reach the design service.', { code: 'NETWORK' });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error?.message ?? `Request to /api/voice/speech failed with status ${response.status}`, {
      status: response.status,
      code: body?.error?.code ?? 'HTTP_ERROR',
    });
  }
  return response;
}

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
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** Save a new design: { design, language } -> { designId, accessToken, revision }. The token is shown only once. */
export const createSavedDesign = (payload, fetchImpl = fetch) => postJson('/api/designs', payload, fetchImpl);

/** Reopen a saved design: { designId, token, language } -> { designId, name, design, revision }. 404 = not this link. */
export const getSavedDesign = ({ designId, token, language }, fetchImpl = fetch) => request(
  `${designPath(designId)}?language=${encodeURIComponent(language)}`,
  fetchImpl,
  { headers: bearer(token) },
);

/** Save over a saved design from `revision`: -> { designId, revision }. 409 STALE = someone saved in between. */
export const updateSavedDesign = ({ designId, token, revision, design, language }, fetchImpl = fetch) => sendJson(
  'PUT', designPath(designId), { design, language }, fetchImpl, { ...bearer(token), 'If-Match': String(revision) },
);
