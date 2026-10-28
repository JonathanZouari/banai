// Unsaved-changes tracking. Every design change (a manual edit or a confirmed AI proposal) raises the
// store revision; selection and view toggles do not. So the design is unsaved exactly when the
// revision differs from the one last saved (or opened).

/** `onChange(dirty)` is called whenever the unsaved state flips. */
export function createUnsavedTracker(store, onChange = () => {}) {
  let savedRevision = store.getState().revision;
  let dirty = false;

  const update = () => {
    const next = store.getState().revision !== savedRevision;
    if (next === dirty) return;
    dirty = next;
    onChange(dirty);
  };
  store.subscribe(update);

  return {
    isDirty: () => dirty,
    /** `revision`: the store revision of the design that was saved (read when the save started). */
    markSaved(revision) {
      savedRevision = revision;
      update();
    },
  };
}
