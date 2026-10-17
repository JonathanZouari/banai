// The atelier's motion and geometry, as pure functions (no DOM, no WebGL), so they are unit-tested.

/** A critically damped spring from 0 to 1 (no overshoot): 1 - (1 + wt) e^-wt. Zero before t = 0. */
export function spring(t, omega = 7.5) {
  if (!(t > 0)) return 0;
  return 1 - (1 + omega * t) * Math.exp(-omega * t);
}

/** Ease-out cubic on a clamped 0..1 progress. */
export function easeOut(progress) {
  const p = Math.max(0, Math.min(1, progress));
  return 1 - (1 - p) ** 3;
}

/** The number shown while a figure counts up to `target`, at progress 0..1. */
export function countUp(target, progress) {
  return Math.round(target * easeOut(progress));
}

/**
 * The end ticks of a dimension line from (x1, y1) to (x2, y2): short strokes perpendicular to the line,
 * `half` pixels each way, and the midpoint where the label sits.
 */
export function dimensionTicks(x1, y1, x2, y2, half = 7) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / length) * half;
  const ny = ((x2 - x1) / length) * half;
  return {
    a: [x1 - nx, y1 - ny, x1 + nx, y1 + ny],
    b: [x2 - nx, y2 - ny, x2 + nx, y2 + ny],
    mid: [(x1 + x2) / 2, (y1 + y2) / 2],
  };
}

/**
 * The box and the line of a measure drawn along an element of `width` x `height`: 'below' runs along the
 * width in a 28 px strip, 'side' along the height.
 */
export function measureGeometry(width, height, side = 'below') {
  const horizontal = side !== 'side';
  const w = horizontal ? Math.max(2, width) : 28;
  const h = horizontal ? 28 : Math.max(2, height);
  const [x1, y1, x2, y2] = horizontal ? [1, 14, w - 1, 14] : [14, 1, 14, h - 1];
  return { w, h, x1, y1, x2, y2, horizontal };
}

/** The hero's timeline in seconds: when the last part lands, when the doors open, when the dimensions draw. */
export function heroTimeline(lastOrder, { hold = 0.7, stagger = 0.075 } = {}) {
  const assembled = hold + lastOrder * stagger + 0.9;
  return { hold, stagger, assembled, doorsOpen: assembled + 0.15, dimsStart: assembled + 0.45 };
}
