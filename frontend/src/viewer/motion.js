// Tiny tween runner driven by the viewer's render loop (no extra timers). Purely
// presentational: tweens move meshes and the camera, never the design state.
// Users who ask for reduced motion get every tween resolved on the next frame.

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function createMotion(now = () => performance.now()) {
  let tweens = [];

  return {
    /** Start a tween. `update(eased, raw)` runs every frame; `done()` once at the end. */
    add({ duration, ease = easeInOutCubic, update, done, tag }) {
      const tween = { start: now(), duration: prefersReducedMotion() ? 0 : duration, ease, update, done, tag };
      tweens.push(tween);
      return tween;
    },
    /** Drop tweens with this tag without finishing them (their `done` does not run). */
    cancel(tag) {
      tweens = tweens.filter((tween) => tween.tag !== tag);
    },
    isRunning: (tag) => tweens.some((tween) => tween.tag === tag),
    tick() {
      if (tweens.length === 0) return;
      const current = tweens;
      tweens = [];
      const alive = [];
      const time = now();
      current.forEach((tween) => {
        const raw = tween.duration <= 0 ? 1 : Math.min((time - tween.start) / tween.duration, 1);
        tween.update(tween.ease(raw), raw);
        if (raw < 1) alive.push(tween);
        else tween.done?.();
      });
      // Tweens added from inside update/done callbacks land in `tweens` meanwhile.
      tweens = alive.concat(tweens);
    },
  };
}
