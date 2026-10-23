// Keeps the advisories in step with the committed design (ADR-018: the rules live in Python).
// A design change is sent after a short debounce; a newer design cancels the request in flight,
// and a late answer for an older design is dropped. Until the answer for the current design
// arrives the feed is `stale`, and quick fixes stay disabled: their ops were computed for an
// older design.

export const ADVICE_DEBOUNCE_MS = 150;

/**
 * @param fetchAdvisories (design, { signal }) => Promise<advisories[]>
 * @param schedule/cancel  injectable timers (tests)
 */
export function createAdvisoryFeed({
  fetchAdvisories, debounceMs = ADVICE_DEBOUNCE_MS, schedule = setTimeout, cancel = clearTimeout,
}) {
  let state = { status: 'idle', items: [], stale: true, design: null };
  let timer = null;
  let inFlight = null;
  let seq = 0;
  const listeners = new Set();

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };

  async function run(design, id) {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    try {
      const items = await fetchAdvisories(design, { signal: controller.signal });
      if (id !== seq) return;
      set({ status: 'ready', items, stale: false });
    } catch (error) {
      if (id !== seq || error?.name === 'AbortError') return;
      set({ status: 'error', stale: true });
    } finally {
      if (inFlight === controller) inFlight = null;
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Call with every committed design; the same design object is ignored. */
    update(design) {
      if (design === state.design) return;
      seq += 1;
      const id = seq;
      if (timer !== null) cancel(timer);
      set({ design, stale: true, status: state.status === 'idle' ? 'loading' : state.status });
      timer = schedule(() => {
        timer = null;
        run(design, id);
      }, debounceMs);
    },

    /** Retry after an error, for the current design. */
    retry() {
      if (!state.design) return;
      seq += 1;
      run(state.design, seq);
    },

    dispose() {
      if (timer !== null) cancel(timer);
      inFlight?.abort();
      listeners.clear();
    },
  };
}
