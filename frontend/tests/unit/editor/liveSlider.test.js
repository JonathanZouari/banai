import { describe, expect, it, vi } from 'vitest';
import { createDragGate, createLiveCommit } from '../../../src/editor/liveSlider.js';

function fakeFrames() {
  let next = 1;
  const queue = new Map();
  return {
    scheduler: {
      request: (fn) => {
        queue.set(next, fn);
        next += 1;
        return next - 1;
      },
      cancel: (id) => queue.delete(id),
    },
    flush() {
      const fns = [...queue.values()];
      queue.clear();
      fns.forEach((fn) => fn());
    },
    get size() {
      return queue.size;
    },
  };
}

describe('createLiveCommit', () => {
  it('commits at most once per frame and the latest value wins', () => {
    const frames = fakeFrames();
    const commit = vi.fn(() => ({ ok: true }));
    const live = createLiveCommit({ initial: 1000, commit, scheduler: frames.scheduler });
    live.move(1010);
    live.move(1020);
    live.move(1030);
    expect(commit).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    frames.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(1030);
    expect(live.value).toBe(1030);
  });

  it('release commits the final value now and cancels the pending frame', () => {
    const frames = fakeFrames();
    const commit = vi.fn(() => ({ ok: true }));
    const live = createLiveCommit({ initial: 1000, commit, scheduler: frames.scheduler });
    live.move(1050);
    expect(live.release(1060)).toMatchObject({ ok: true, value: 1060 });
    expect(frames.size).toBe(0);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(1060);
  });

  it('does not dispatch a value that was already committed or that the design already holds', () => {
    const frames = fakeFrames();
    const commit = vi.fn(() => ({ ok: true }));
    const live = createLiveCommit({ initial: 1000, commit, scheduler: frames.scheduler });
    live.move(1000);
    frames.flush();
    live.move(1010);
    frames.flush();
    expect(live.release(1010)).toMatchObject({ ok: true });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('keeps the last valid value when the domain rejects and reports it on release', () => {
    const frames = fakeFrames();
    const rejected = { ok: false, error: { code: 'OVERLAP' } };
    const onResult = vi.fn();
    const live = createLiveCommit({
      initial: 400, scheduler: frames.scheduler, onResult,
      commit: (mm) => (mm > 500 ? rejected : { ok: true }),
    });
    live.move(450);
    frames.flush();
    live.move(900);
    frames.flush();
    expect(live.value).toBe(450);
    expect(onResult).toHaveBeenLastCalledWith(rejected, 900);
    expect(live.release(900)).toEqual({ ok: false, value: 450, result: rejected });
    live.move(460);
    frames.flush();
    expect(live.value).toBe(460);
  });

  it('accept() records a value committed through the text field', () => {
    const frames = fakeFrames();
    const commit = vi.fn(() => ({ ok: true }));
    const live = createLiveCommit({ initial: 1000, commit, scheduler: frames.scheduler });
    live.accept(1500);
    expect(live.release(1500)).toMatchObject({ ok: true, value: 1500 });
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('createDragGate', () => {
  it('holds renders while a pointer is down and flushes once, after the last release', () => {
    const gate = createDragGate();
    expect(gate.active).toBe(false);
    gate.begin(1, 'slider-a');
    gate.begin(2, 'slider-b');
    expect(gate.active).toBe(true);
    expect(gate.tags).toEqual(['slider-a', 'slider-b']);
    gate.defer();
    expect(gate.end(1)).toBe(false); // another pointer still holds a slider
    expect(gate.end(2)).toBe(true); // idle, and a render was deferred
    expect(gate.end(2)).toBe(false); // releases are idempotent
    expect(gate.active).toBe(false);
  });

  it('does not ask for a render when none was skipped, and endAll clears a lost pointerup', () => {
    const gate = createDragGate();
    gate.begin(1);
    expect(gate.end(1)).toBe(false);
    gate.begin(3);
    gate.defer();
    expect(gate.endAll()).toBe(true);
    expect(gate.active).toBe(false);
  });
});
