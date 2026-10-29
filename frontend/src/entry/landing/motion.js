// Pure motion helpers for the landing page: scroll progress, windows, easing and damping.
// No DOM access, so they are unit-testable.

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Progress of `p` through the window [start, end], clamped to 0..1. */
export const windowed = (p, start, end) => clamp((p - start) / (end - start));

/** Smooth start and end (quintic smootherstep): softer than a cubic at both ends. */
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Frame-rate independent exponential damping toward a target.
 * `lambda` is how quickly it settles (higher is faster); `dt` is in seconds.
 */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/**
 * How far a pinned section has been scrolled through: 0 when its top reaches the top of the
 * visible area, 1 when its bottom reaches the bottom. `top` and `height` come from its bounding
 * rectangle; `visible` is the height of the area the sticky stage fills.
 */
export function sectionProgress({ top, height }, visible) {
  const span = height - visible;
  return span > 0 ? clamp(-top / span) : 0;
}

/** The index of the last beat whose start is at or before `p` (beats sorted by `at`). */
export const beatAt = (beats, p) => beats.reduce((current, beat, i) => (p >= beat.at ? i : current), 0);
