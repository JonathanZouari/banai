// Accounts PROTOTYPE (branch feature/auth; accounts are excluded from the MVP scope in CLAUDE.md).
// The signed-in session. The access token lives only in memory; the refresh token (and the user's
// email, for the top bar) is kept in localStorage so a reload stays signed in. Refresh tokens rotate:
// every refresh stores the new one. Nothing here touches Supabase: all calls go to our backend.

const STORAGE_KEY = 'banai.account';
const REFRESH_MARGIN_MS = 60_000; // refresh a minute before the access token expires

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage: the session simply ends with the tab
  }
}

/**
 * `api`: { signUp, signIn, refreshSession, signOut } from api/client.js. `getLanguage()` localizes
 * server errors. Returns the account controller; `subscribe(fn)` is told the user (or null) on change.
 */
export function createAccount({ api, getLanguage, storage = browserStorage(), now = () => Date.now() }) {
  let session = null; // { user, accessToken, refreshToken, expiresAt }
  let refreshing = null;
  const listeners = new Set();

  const persist = () => {
    try {
      if (session) storage?.setItem(STORAGE_KEY, JSON.stringify({ refreshToken: session.refreshToken, user: session.user }));
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      // storage full or blocked: the in-memory session still works
    }
  };
  const set = (next) => {
    session = next;
    persist();
    listeners.forEach((listener) => listener(session?.user ?? null));
  };
  const fromResponse = (data) => ({
    user: { id: data.user.id, email: data.user.email },
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: now() + data.expiresIn * 1000,
  });

  const stored = () => {
    try {
      const value = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
      return typeof value?.refreshToken === 'string' ? value : null;
    } catch {
      return null;
    }
  };

  /** One refresh at a time; a failed refresh signs out. */
  const refresh = (refreshToken) => {
    if (!refreshing) {
      refreshing = api.refreshSession({ refreshToken, language: getLanguage() })
        .then((data) => set(fromResponse(data)))
        .catch((error) => {
          // Only a rejected token ends the session; a network blip keeps it for the next try.
          if (error?.status === 401) set(null);
          throw error;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  };

  /** A fresh access token, refreshing first when it is about to expire. */
  const accessToken = async () => {
    if (!session) throw Object.assign(new Error('Not signed in'), { status: 401, code: 'UNAUTHORIZED' });
    if (session.expiresAt - now() < REFRESH_MARGIN_MS) await refresh(session.refreshToken);
    return session.accessToken;
  };

  return {
    user: () => session?.user ?? null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Restore a stored session at startup. Resolves to the user or null; never throws. */
    async restore() {
      const saved = stored();
      if (!saved) return null;
      try {
        await refresh(saved.refreshToken);
      } catch {
        return null;
      }
      return session?.user ?? null;
    },

    /** Resolves to { confirmationRequired: true } when the account must be confirmed by email first. */
    async signUp(email, password) {
      const data = await api.signUp({ email, password, language: getLanguage() });
      if (data.confirmationRequired) return { confirmationRequired: true };
      set(fromResponse(data));
      return { confirmationRequired: false };
    },

    async signIn(email, password) {
      set(fromResponse(await api.signIn({ email, password, language: getLanguage() })));
    },

    /** Always ends the local session, even when the server cannot be told. */
    async signOut() {
      const current = session;
      set(null);
      if (current) await api.signOut({ accessToken: current.accessToken, language: getLanguage() }).catch(() => {});
    },

    /**
     * Run `call(accessToken)`. A 401 (e.g. the token was revoked) gets one refresh and one retry;
     * when that fails too the session ends and the error is passed on.
     */
    async withToken(call) {
      try {
        return await call(await accessToken());
      } catch (error) {
        if (error?.status !== 401 || !session) throw error;
        await refresh(session.refreshToken);
        return call(session.accessToken);
      }
    },
  };
}
