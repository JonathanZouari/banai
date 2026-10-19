// Which advisories pop up after a change. The advisory panel keeps every advisory; the pop-up only
// raises a warning or a critical one that a change has just introduced, so the customer sees it at the
// moment of the choice, with its fixes. It never blocks the choice: "השאר כך" keeps the design as it is
// (capabilities, not taste). Pure: no DOM, unit-tested.

export const ALERT_LEVELS = Object.freeze(['critical', 'warn']);
const RANK = Object.freeze({ critical: 0, warn: 1 });

/** Warnings and critical advisories in `items` whose id was not in `previousIds`, most severe first. */
export function newAlerts(previousIds, items) {
  return items
    .filter((item) => ALERT_LEVELS.includes(item.level) && !previousIds.has(item.id))
    .sort((a, b) => RANK[a.level] - RANK[b.level]);
}

/**
 * Follows the advisory feed. `next(feedState)` returns the advisories that just appeared ([] when none),
 * or null while the answer for the current design is still on its way. The first answer is the starting
 * point (the design the customer opened), not a change; reset() starts again (a new or opened project).
 */
export function createAlertTracker() {
  let seen = null;
  return {
    next(state) {
      if (state.stale || state.status !== 'ready') return null;
      const ids = new Set(state.items.map((item) => item.id));
      if (seen === null) {
        seen = ids;
        return [];
      }
      const fresh = newAlerts(seen, state.items);
      seen = ids;
      return fresh;
    },
    reset() {
      seen = null;
    },
  };
}

/**
 * The pop-up's queue after an update: alerts that no longer apply leave, those that remain take their
 * current version (a fix is only valid for the design it was computed for), and new ones join at the end.
 */
export function mergeQueue(queue, items, fresh) {
  const current = new Map(items.map((item) => [item.id, item]));
  const kept = queue.filter((item) => current.has(item.id)).map((item) => current.get(item.id));
  const ids = new Set(kept.map((item) => item.id));
  return [...kept, ...fresh.filter((item) => !ids.has(item.id))];
}

/** The text a customer sends Bob when they want other ways to fix an advisory. */
export function askBobText(item) {
  return `קיבלתי אזהרה: "${item.title}". מה האפשרויות לתקן את זה?`;
}
