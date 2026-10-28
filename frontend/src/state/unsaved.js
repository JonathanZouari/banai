// Unsaved-changes tracking: is the committed design different from the last design saved to the
// private link (or, before the first save, from the design the customer started with)? Compared by
// value, so editing something back to how it was clears the flag. Read-only: it never edits state.

const fingerprint = (design) => JSON.stringify(design);

export function createUnsavedTracker(store) {
  let baseline = fingerprint(store.getState().design);
  let seen = store.getState().design;
  let dirty = false;
  const listeners = new Set();

  const refresh = () => {
    const next = fingerprint(seen) !== baseline;
    if (next === dirty) return;
    dirty = next;
    listeners.forEach((listener) => listener(dirty));
  };
  store.subscribe(({ design }) => {
    if (design === seen) return; // selection or view changes: nothing to compare
    seen = design;
    refresh();
  });

  return {
    isDirty: () => dirty,
    /** `design` was saved: it becomes the baseline (later edits made during the save stay unsaved). */
    markSaved(design) {
      baseline = fingerprint(design);
      refresh();
    },
    /** A fresh start (the start screen's choice): the current design is the baseline. */
    reset() {
      baseline = fingerprint(seen);
      refresh();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
