// Keeps the design being edited in the "Last designs" archive. It records a moment after a real change
// to the design (not to the selection or the door view), and never records a design the user has not
// touched. One session is one archive entry that is updated in place.

/**
 * `onError(kind)` is called at most once per failure streak when the archive could not keep the design
 * (storage blocked, full, or the design too large).
 */
export function createArchiveRecorder({ store, archive, delay = 800, onError = () => {} }) {
  let currentId = null;
  let lastDesign = store.getState().design;
  let pending = false;
  let timer = null;
  let muted = false;
  let failing = false;

  const write = () => {
    timer = null;
    if (!pending) return;
    pending = false;
    const { ok, id } = archive.upsert(currentId, store.getState().design);
    if (ok) {
      currentId = id;
      failing = false;
    } else if (!failing) {
      failing = true;
      onError('write');
    }
  };

  store.subscribe((state) => {
    if (muted || state.design === lastDesign) return;
    lastDesign = state.design;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(write, delay);
  });

  return {
    /** A new session (a start-screen choice): the next change creates a new entry. */
    startNew() {
      write();
      currentId = null;
      lastDesign = store.getState().design;
    },

    /**
     * Opens an archived design in the editor and keeps updating that entry. Returns { ok } and leaves
     * the editor untouched when the stored design is not valid for this version.
     */
    openArchived(id, design) {
      muted = true;
      try {
        store.load(design);
      } catch {
        return { ok: false };
      } finally {
        muted = false;
      }
      pending = false;
      clearTimeout(timer);
      currentId = id;
      lastDesign = store.getState().design;
      return { ok: true };
    },

    /** Writes a pending change now (the page is being hidden or closed). */
    flush() {
      clearTimeout(timer);
      write();
    },
  };
}
