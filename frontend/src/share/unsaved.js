// Tracks whether the committed design differs from the last saved one. Store snapshots are frozen
// and replaced on every change, so a reference comparison is enough (manual edits and confirmed AI
// proposals both replace state.design).

/** `onChange(dirty)` runs whenever the unsaved state flips. */
export function createUnsavedTracker(store, onChange = () => {}) {
  let saved = store.getState().design;
  let dirty = false;
  const update = () => {
    const next = store.getState().design !== saved;
    if (next === dirty) return;
    dirty = next;
    onChange(dirty);
  };
  const unsubscribe = store.subscribe(update);
  return {
    isDirty: () => dirty,
    /** Record `design` as saved: an edit made while the save was in flight stays unsaved. */
    markSaved(design) {
      saved = design;
      update();
    },
    dispose: unsubscribe,
  };
}

/** Save button dot (with a screen-reader note) and the browser's leave-page warning. */
export function bindUnsavedWarning(tracker, saveButton) {
  const note = document.createElement('span');
  note.className = 'visually-hidden';
  note.textContent = ' (unsaved changes)';
  const render = (dirty) => {
    saveButton.classList.toggle('btn--unsaved', dirty);
    if (dirty) saveButton.append(note);
    else note.remove();
  };
  window.addEventListener('beforeunload', (event) => {
    if (!tracker.isDirty()) return;
    event.preventDefault();
    event.returnValue = ''; // older browsers need it set to show the prompt
  });
  render(tracker.isDirty());
  return render;
}
