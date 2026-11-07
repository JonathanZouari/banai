// In-app views: the homepage, the designer, the room-fit view and the review-and-send screen.
// The URL itself never changes: the hash may hold the private design link (#d=...), so the view
// lives in history.state. Browser Back/Forward move between views like normal pages.

export const VIEWS = Object.freeze(['home', 'designer', 'room', 'review']);

/**
 * `onShow(view, { initial, fromHistory })` renders a view. `history` and `target` are injectable
 * for tests (defaults: window.history and window).
 */
export function createRouter({ initial, onShow, history = globalThis.history, target = globalThis }) {
  let view = VIEWS.includes(initial) ? initial : 'home';
  // Keep whatever else the entry holds; only add the view.
  history.replaceState({ ...(history.state ?? {}), view }, '');
  target.addEventListener('popstate', (event) => {
    const next = event.state?.view;
    if (!VIEWS.includes(next) || next === view) return;
    view = next;
    onShow(view, { fromHistory: true });
  });
  onShow(view, { initial: true });

  return {
    current: () => view,
    /** Show another view as a new history entry (Back returns to the previous one). */
    go(next) {
      if (!VIEWS.includes(next) || next === view) return;
      view = next;
      history.pushState({ view }, '');
      onShow(view, {});
    },
  };
}
