// The OpenAI key is kept only on this computer, in this browser's localStorage. It is never
// written to the server; the backend only checks it on request. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded.
export const STORAGE_KEY = 'banai.openaiApiKey';

export function createKeyStorage(storage = globalThis.localStorage) {
  return {
    get() {
      try {
        return storage?.getItem(STORAGE_KEY) || null;
      } catch {
        return null;
      }
    },
    set(apiKey) {
      try {
        storage.setItem(STORAGE_KEY, apiKey);
        return true;
      } catch {
        return false;
      }
    },
    remove() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // nothing to remove
      }
    },
  };
}
