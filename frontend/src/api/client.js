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

/** Error thrown for a failed API call: `status` is the HTTP status, `code` the server's error code. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
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
    throw new ApiError(0, 'NETWORK', 'Could not reach the design service');
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body || body.success !== true) {
    const error = body && body.error ? body.error : {};
    throw new ApiError(response.status, error.code ?? 'UNKNOWN', error.message ?? `Request to ${path} failed with status ${response.status}`);
  }
  return body.data;
}

/** One agent turn. Returns { reply, proposal | null }; the design is never changed by this call. */
export const sendChat = ({ messages, design, revision }, fetchImpl = fetch) => postJson('/api/chat', { messages, design, revision }, fetchImpl);

/** Ask the server to verify and apply a signed proposal. Returns { design, revision }; 409 STALE throws. */
export const applyProposal = ({ design, revision, proposal }, fetchImpl = fetch) => postJson('/api/proposals/apply', { design, revision, proposal }, fetchImpl);

/** Speech to text. `audio` is a recorded Blob; returns the transcript string. */
export async function transcribeAudio(audio, fetchImpl = fetch) {
  if (!API_BASE_URL) throw new ApiError(0, 'NO_API', 'The API base URL is not configured');
  let response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/voice/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type || 'audio/webm' },
      body: audio,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the design service');
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body || body.success !== true) {
    const error = body && body.error ? body.error : {};
    throw new ApiError(response.status, error.code ?? 'UNKNOWN', error.message ?? 'Transcription failed');
  }
  return body.data.text;
}

/** Text to speech. Returns an audio Blob (MP3). */
export async function speakText(text, fetchImpl = fetch) {
  if (!API_BASE_URL) throw new ApiError(0, 'NO_API', 'The API base URL is not configured');
  let response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the design service');
  }
  if (!response.ok) throw new ApiError(response.status, 'VOICE_ERROR', 'Speech failed');
  return response.blob();
}
