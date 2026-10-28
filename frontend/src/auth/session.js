// The customer's login session. The access token lives only in memory; the refresh token is kept in
// localStorage so a reload stays logged in. Storage may be unavailable (private mode): then the session
// simply ends with the tab.
import { logIn, logOut, refreshSession, signUp } from '../api/client.js';

const REFRESH_KEY = 'banai.refresh';
const EARLY_REFRESH_MS = 60_000; // refresh a minute before the access token expires

function safeStorage(storage) {
  return {
    get: () => { try { return storage?.getItem(REFRESH_KEY) ?? null; } catch { return null; } },
    set: (value) => { try { storage?.setItem(REFRESH_KEY, value); } catch { /* not persisted */ } },
    clear: () => { try { storage?.removeItem(REFRESH_KEY); } catch { /* nothing stored */ } },
  };
}

export function createSession({
  storage = globalThis.localStorage, api = { logIn, logOut, refreshSession, signUp }, now = () => Date.now(),
} = {}) {
  const stored = safeStorage(storage);
  const listeners = new Set();
  let current = null; // { user, accessToken, expiresAt }

  const notify = () => listeners.forEach((listener) => listener(current?.user ?? null));
  const adopt = (data) => {
    current = { user: data.user, accessToken: data.accessToken, expiresAt: now() + data.expiresIn * 1000 };
    stored.set(data.refreshToken);
    notify();
    return data.user;
  };
  const forget = () => {
    current = null;
    stored.clear();
    notify();
  };

  async function refresh(language) {
    const refreshToken = stored.get();
    if (!refreshToken) return null;
    try {
      return adopt(await api.refreshSession({ refreshToken, language }));
    } catch (error) {
      if (error?.status === 401) forget(); // the refresh token is no longer valid
      return null;
    }
  }

  return {
    user: () => current?.user ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Resumes the session from a previous visit, if there is one. */
    restore: (language) => refresh(language),
    async logIn({ email, password, language }) {
      return adopt(await api.logIn({ email, password, language }));
    },
    /**
     * Creates the account without logging in: the customer logs in next with the new password.
     * { confirmationRequired } says whether the email must be confirmed first.
     */
    async signUp({ email, password, language }) {
      const data = await api.signUp({ email, password, language });
      return { confirmationRequired: data.confirmationRequired === true };
    },
    async logOut() {
      const token = current?.accessToken;
      forget();
      if (token) await api.logOut(token).catch(() => {}); // logged out locally either way
    },
    /** A valid access token (refreshed when close to expiry), or null when logged out. */
    async accessToken(language) {
      if (!current) return null;
      if (current.expiresAt - now() > EARLY_REFRESH_MS) return current.accessToken;
      await refresh(language);
      return current?.accessToken ?? null;
    },
  };
}
