// Pure helpers behind the live sliders (no DOM, so they are unit-tested in Node).
//
// createLiveCommit  turns a stream of slider `input` values into at most one commit per animation
//                   frame (the latest value wins) and remembers the last value the domain accepted.
// createDragGate    tells the panel when a slider is being dragged so it can hold back a re-render
//                   that would replace the slider under the pointer.

const OK = Object.freeze({ ok: true });

/** requestAnimationFrame when it exists, otherwise a ~60 Hz timer (tests inject their own). */
export function frameScheduler() {
  const hasFrames = typeof globalThis.requestAnimationFrame === 'function';
  return {
    request: (callback) => (hasFrames ? globalThis.requestAnimationFrame(callback) : setTimeout(callback, 16)),
    cancel: (handle) => (hasFrames ? globalThis.cancelAnimationFrame(handle) : clearTimeout(handle)),
  };
}

/**
 * @param {object} options
 * @param {(mm: number) => {ok: boolean}} options.commit  Dispatches a value; returns the domain result.
 * @param {number} options.initial  The value the domain currently holds.
 * @param {(result: object, mm: number) => void} [options.onResult]  Called after every commit attempt.
 * @param {{request: Function, cancel: Function}} [options.scheduler]  Frame scheduler (injectable).
 *
 * `move(mm)`    an `input` event: remember the value, commit it on the next frame (latest wins).
 * `release(mm)` the `change` event: cancel the pending frame and commit the final value now.
 *               Returns { ok, value, result }; when not ok, `value` is the last accepted value
 *               and the caller should snap the control back to it.
 * `accept(mm)`  the value was committed some other way (typed in the text field).
 */
export function createLiveCommit({ commit, initial, onResult, scheduler = frameScheduler() }) {
  let valid = initial; // last value the domain accepted
  let attempted = initial; // last value passed to commit (or equal to `valid`)
  let latest = initial; // newest value from the slider
  let lastResult = OK;
  let frame = null;

  const attempt = (mm) => {
    attempted = mm;
    // The domain already holds this value: nothing to dispatch.
    lastResult = mm === valid ? OK : commit(mm);
    if (lastResult.ok) valid = mm;
    onResult?.(lastResult, mm);
  };

  const run = () => {
    frame = null;
    if (latest !== attempted) attempt(latest);
  };

  return {
    move(mm) {
      latest = mm;
      if (frame === null) frame = scheduler.request(run);
    },
    release(mm) {
      if (frame !== null) {
        scheduler.cancel(frame);
        frame = null;
      }
      latest = mm;
      if (mm !== attempted) attempt(mm);
      return { ok: lastResult.ok, value: valid, result: lastResult };
    },
    accept(mm) {
      valid = mm;
      attempted = mm;
      latest = mm;
      lastResult = OK;
    },
    get value() {
      return valid;
    },
    get pending() {
      return frame !== null;
    },
    dispose() {
      if (frame !== null) scheduler.cancel(frame);
      frame = null;
    },
  };
}

/**
 * Counts the pointers that are currently dragging a slider. While one is down the panel must
 * not replace the DOM (that would drop the slider mid-drag), so it `defer()`s its render and
 * runs it once the last pointer is released.
 */
export function createDragGate() {
  const down = new Map(); // pointerId -> the slider element (or any tag) being dragged
  let deferred = false;

  const flush = () => {
    if (down.size > 0 || !deferred) return false;
    deferred = false;
    return true;
  };

  return {
    begin(pointerId, tag = null) {
      down.set(pointerId, tag);
    },
    /** Ends one pointer. Returns true when the gate is now idle and a render was deferred. */
    end(pointerId) {
      return down.delete(pointerId) ? flush() : false;
    },
    /** Ends every pointer (a safety net for a lost pointerup). Same return value as `end`. */
    endAll() {
      if (down.size === 0) return false;
      down.clear();
      return flush();
    },
    /** Records that a render was skipped while active. */
    defer() {
      deferred = true;
    },
    get active() {
      return down.size > 0;
    },
    /** The elements currently being dragged. */
    get tags() {
      return [...down.values()];
    },
  };
}
