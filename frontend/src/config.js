// Backend base URL, injected at build time (VITE_API_BASE_URL).
// Production builds must set it explicitly: there is NO silent localhost fallback in
// production. When it is missing, API calls fail and the UI shows its error banner.
const configured = import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL = configured ?? (import.meta.env.PROD ? null : 'http://localhost:8001');
