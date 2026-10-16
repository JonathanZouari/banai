// Pure view-model for the OpenAI key settings (no DOM). The key lives in browser storage only;
// every check goes through the backend, which calls OpenAI and keeps nothing.
//
// status: 'not_configured' | 'checking' | 'connected' | 'invalid_key' | 'model_unavailable' | 'unreachable'

export const STATUS_LABELS = Object.freeze({
  not_configured: 'Not connected',
  checking: 'Checking…',
  connected: 'Key connected',
  invalid_key: 'Key invalid',
  model_unavailable: 'Model unavailable',
  unreachable: 'OpenAI unreachable',
});

export const STATUS_DETAILS = Object.freeze({
  not_configured: 'Add your OpenAI API key to connect the AI designer.',
  checking: 'Checking your key with OpenAI…',
  connected: 'Your key works. It is stored only in this browser on this computer.',
  invalid_key: 'OpenAI rejected this key. Check it or create a new one.',
  model_unavailable: 'The key works, but it cannot use the configured model.',
  unreachable: 'Could not reach OpenAI to check the key. Try again in a moment.',
});

const SAVEABLE = new Set(['connected', 'model_unavailable']);
const KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,500}$/;

export const maskKey = (apiKey) => `sk-...${apiKey.slice(-4)}`;

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
      return { ok: false, message: error.message, code: error.code };
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
        set({ error: "That doesn't look like an OpenAI API key (it starts with sk-)." });
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
        set({ ...previous, busy: false, error: `${STATUS_DETAILS[status]} The key was not saved.` });
        return { ok: false };
      }
      if (!storage.set(apiKey)) {
        set({ ...previous, busy: false, error: 'This browser blocked local storage, so the key could not be saved.' });
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
