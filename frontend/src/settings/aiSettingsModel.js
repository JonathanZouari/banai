// Pure view-model for the OpenAI key settings (no DOM). The key lives in browser storage only;
// every check goes through the backend, which calls OpenAI and keeps nothing.
//
// status: 'not_configured' | 'checking' | 'connected' | 'invalid_key' | 'model_unavailable' | 'unreachable'

export const STATUS_LABELS = Object.freeze({
  not_configured: 'לא מחובר',
  checking: 'בודק…',
  connected: 'המפתח מחובר',
  invalid_key: 'מפתח לא תקין',
  model_unavailable: 'המודל לא זמין',
  unreachable: 'אין חיבור ל-OpenAI',
});

export const STATUS_DETAILS = Object.freeze({
  not_configured: 'הוסיפו מפתח OpenAI כדי לחבר את בוב הבנאי.',
  checking: 'בודק את המפתח מול OpenAI…',
  connected: 'המפתח עובד. הוא שמור רק בדפדפן הזה, במחשב הזה.',
  invalid_key: 'OpenAI דחה את המפתח. בדקו אותו או צרו מפתח חדש.',
  model_unavailable: 'המפתח עובד, אבל אין לו גישה למודל שהוגדר.',
  unreachable: 'לא הצלחנו להגיע ל-OpenAI כדי לבדוק את המפתח. נסו שוב בעוד רגע.',
});

const SAVEABLE = new Set(['connected', 'model_unavailable']);
const KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,500}$/;

export const maskKey = (apiKey) => `sk-...${apiKey.slice(-4)}`;

const CHECK_ERRORS = Object.freeze({
  INVALID_FORMAT: 'זה לא נראה כמו מפתח OpenAI API (הוא מתחיל ב-sk-).',
  BUSY: 'בדיקת מפתח אחרת רצה כרגע. נסו שוב בעוד רגע.',
  PAYLOAD_TOO_LARGE: 'הבקשה גדולה מדי.',
  REQUEST_FAILED: 'לא הצלחנו לבדוק את המפתח. נסו שוב.',
});

export function createAiSettingsModel({ storage, verify }) {
  let state = { status: 'not_configured', maskedKey: null, model: null, checkedAt: null, busy: false, error: null };
  const listeners = new Set();
  const set = (patch) => {
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((listener) => listener(state));
  };

  async function check(apiKey) {
    try {
      return { ok: true, result: await verify(apiKey) };
    } catch (error) {
      // The server's messages are English; the UI speaks Hebrew, so errors are shown by code.
      return { ok: false, message: CHECK_ERRORS[error.code] ?? CHECK_ERRORS.REQUEST_FAILED, code: error.code };
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    isConnected: () => state.status === 'connected',

    /** Reads the stored key (if any) and checks it, so the UI always shows the real status. */
    async load() {
      const apiKey = storage.get();
      if (!apiKey) return set({ status: 'not_configured', maskedKey: null });
      set({ status: 'checking', maskedKey: maskKey(apiKey), busy: true, error: null });
      const outcome = await check(apiKey);
      if (!outcome.ok) return set({ status: 'unreachable', busy: false });
      const { status, model, checkedAt } = outcome.result;
      return set({ status, model, checkedAt, busy: false });
    },

    /** Checks a new key and stores it only if OpenAI accepted it. Returns { ok, error? }. */
    async saveKey(rawKey) {
      const apiKey = String(rawKey ?? '').trim();
      if (!KEY_PATTERN.test(apiKey)) {
        set({ error: 'זה לא נראה כמו מפתח OpenAI API (הוא מתחיל ב-sk-).' });
        return { ok: false };
      }
      const previous = state;
      set({ busy: true, error: null, status: 'checking' });
      const outcome = await check(apiKey);
      if (!outcome.ok) {
        set({ ...previous, busy: false, error: outcome.message });
        return { ok: false };
      }
      const { status, model, checkedAt } = outcome.result;
      if (!SAVEABLE.has(status)) {
        set({ ...previous, busy: false, error: `${STATUS_DETAILS[status]} המפתח לא נשמר.` });
        return { ok: false };
      }
      if (!storage.set(apiKey)) {
        set({ ...previous, busy: false, error: 'הדפדפן חוסם אחסון מקומי, ולכן אי אפשר לשמור את המפתח.' });
        return { ok: false };
      }
      set({ status, model, checkedAt, maskedKey: maskKey(apiKey), busy: false, error: null });
      return { ok: true };
    },

    /** Re-checks the stored key. */
    test() {
      return this.load();
    },

    removeKey() {
      storage.remove();
      set({ status: 'not_configured', maskedKey: null, model: null, checkedAt: null, error: null });
    },
  };
}
