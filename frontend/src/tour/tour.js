// First-visit guided tour: a dimmed page with a spotlight on one area at a time and a bubble that
// explains it. Shown once (remembered in localStorage, if available); the header's "?" replays it.
// Keyboard: arrows move between steps (mirrored in RTL), Esc skips, Tab stays inside the bubble.
// "Try it" steps let the customer use the highlighted area; `tryIts[name](done)` watches for it
// (returning an unsubscribe), and the tour moves on by itself shortly after.
import { el } from '../editor/fields.js';
import { TOUR_STEPS, tourStrings } from './steps.js';

export const TOUR_KEY = 'banai.tour.v1';
const GAP = 14; // px between the spotlight and the bubble
const PAD = 8; // px of spotlight around the target
const MARGIN = 12; // px the bubble keeps from the window edges
const TRIED_PAUSE = 1100; // ms the "Great!" note stays before the next step

export function tourSeen(storage) {
  try {
    return storage?.getItem(TOUR_KEY) === 'done';
  } catch {
    return false; // storage blocked (private mode): show it, it just won't be remembered
  }
}

function markSeen(storage) {
  try {
    storage?.setItem(TOUR_KEY, 'done');
  } catch {
    // not remembered; the tour still closes
  }
}

/**
 * Where the bubble goes beside `target` (a DOMRect): the side with room, else inside the target.
 * Pure, so it is unit-tested. Returns { placement, left, top, arrow } in px (arrow along the edge).
 */
export function placeBubble(target, bubble, viewport) {
  const room = {
    right: viewport.width - target.right - GAP,
    left: target.left - GAP,
    bottom: viewport.height - target.bottom - GAP,
    top: target.top - GAP,
  };
  const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
  const midX = target.left + target.width / 2;
  const midY = target.top + target.height / 2;
  // Tall areas (panels) get the bubble beside them; small ones (a header button) below or above.
  const order = target.height < bubble.height ? ['bottom', 'top', 'right', 'left'] : ['right', 'left', 'bottom', 'top'];
  let placement = order.find((side) =>
    (side === 'right' || side === 'left') ? room[side] >= bubble.width + MARGIN : room[side] >= bubble.height + MARGIN);
  let left;
  let top;
  if (placement === 'right' || placement === 'left') {
    left = placement === 'right' ? target.right + GAP : target.left - GAP - bubble.width;
    top = clamp(midY - bubble.height / 2, MARGIN, viewport.height - bubble.height - MARGIN);
  } else if (placement) {
    top = placement === 'bottom' ? target.bottom + GAP : target.top - GAP - bubble.height;
    left = clamp(midX - bubble.width / 2, MARGIN, viewport.width - bubble.width - MARGIN);
  } else {
    placement = 'inside'; // a large area (the 3D view): float near its bottom, centred
    left = clamp(midX - bubble.width / 2, MARGIN, viewport.width - bubble.width - MARGIN);
    top = clamp(target.bottom - bubble.height - 24, MARGIN, viewport.height - bubble.height - MARGIN);
  }
  const arrow = (placement === 'right' || placement === 'left')
    ? clamp(midY - top, 18, bubble.height - 18)
    : clamp(midX - left, 18, bubble.width - 18);
  return { placement, left: Math.round(left), top: Math.round(top), arrow: Math.round(arrow) };
}

export function createTour({
  getLanguage = () => 'he', storage = globalThis.localStorage, steps = TOUR_STEPS, tryIts = {},
} = {}) {
  let open = null; // { index, root, spotlight, bubble, gesture, returnFocus, stopTry }

  const stopTrying = () => {
    open?.stopTry?.();
    if (open) open.stopTry = null;
  };

  const close = () => {
    if (!open) return;
    stopTrying();
    const { root, returnFocus } = open;
    window.removeEventListener('resize', position);
    root.remove();
    open = null;
    markSeen(storage);
    (returnFocus?.isConnected ? returnFocus : document.getElementById('open-tour'))?.focus();
  };

  function position() {
    if (!open) return;
    const target = document.querySelector(steps[open.index].target);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const spot = {
      left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
    };
    Object.assign(open.spotlight.style, {
      left: `${spot.left}px`, top: `${spot.top}px`, width: `${spot.width}px`, height: `${spot.height}px`,
    });
    const spotRect = { ...spot, right: spot.left + spot.width, bottom: spot.top + spot.height };
    const size = { width: open.bubble.offsetWidth, height: open.bubble.offsetHeight };
    const place = placeBubble(spotRect, size, { width: window.innerWidth, height: window.innerHeight });
    open.bubble.dataset.placement = place.placement;
    open.bubble.style.left = `${place.left}px`;
    open.bubble.style.top = `${place.top}px`;
    open.bubble.style.setProperty('--tour-arrow', `${place.arrow}px`);
  }

  const go = (index) => {
    if (index < 0) return;
    if (index >= steps.length) {
      close();
      return;
    }
    open.index = index;
    render();
  };

  function render() {
    stopTrying();
    const language = getLanguage();
    const s = tourStrings(language);
    const step = steps[open.index];
    const [title, body] = s.steps[step.id];
    const last = open.index === steps.length - 1;
    const { bubble } = open;
    bubble.lang = language;
    bubble.dir = language === 'he' ? 'rtl' : 'ltr';
    bubble.setAttribute('aria-label', `${s.label}: ${title}`);

    const button = (text, onClick, className, testId) => {
      const node = el('button', { className: `btn ${className}`, text, attrs: { type: 'button' } });
      node.dataset.testid = testId;
      node.addEventListener('click', onClick);
      return node;
    };
    const dots = steps.map((_, i) => el('span', { className: `tour__dot${i === open.index ? ' tour__dot--on' : ''}` }));
    const next = button(last ? s.done : s.next, () => go(open.index + 1), 'btn--primary', 'tour-next');
    const actions = [button(s.skip, close, 'btn--ghost tour__skip', 'tour-skip')];
    if (open.index > 0) actions.push(button(s.back, () => go(open.index - 1), 'btn--tonal', 'tour-back'));
    actions.push(next);

    const watch = step.tryIt ? tryIts[step.tryIt] : null;
    const tryNote = watch
      ? el('p', { className: 'tour__try', text: s.tries[step.tryIt][0], attrs: { role: 'status' } })
      : null;
    if (tryNote) tryNote.dataset.testid = 'tour-try';
    bubble.replaceChildren(
      el('p', { className: 'tour__progress', text: s.progress(open.index + 1, steps.length) }),
      el('h2', { className: 'tour__title', text: title, attrs: { id: 'tour-title' } }),
      el('p', { className: 'tour__body', text: body, attrs: { id: 'tour-body' } }),
      ...(tryNote ? [tryNote] : []),
      el('div', { className: 'tour__footer' }, [el('div', { className: 'tour__dots', attrs: { 'aria-hidden': 'true' } }, dots), el('div', { className: 'tour__actions' }, actions)]),
    );
    bubble.dataset.step = step.id;
    open.gesture.hidden = !step.gesture;
    // While trying, the page under the dim layer accepts the mouse; the bubble stays on top.
    open.root.classList.toggle('tour--try', Boolean(watch));
    if (watch) {
      const index = open.index;
      let tried = false;
      open.stopTry = watch(() => {
        if (tried || !open || open.index !== index) return;
        tried = true;
        stopTrying();
        tryNote.textContent = s.tries[step.tryIt][1];
        tryNote.classList.add('tour__try--done');
        open.gesture.hidden = true;
        setTimeout(() => { if (open && open.index === index) go(index + 1); }, TRIED_PAUSE);
      });
    }
    position();
    next.focus();
  }

  const onKey = (event) => {
    if (!open) return;
    const rtl = open.bubble.dir === 'rtl';
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) {
      event.preventDefault();
      go(open.index + 1);
    } else if (event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) {
      event.preventDefault();
      go(open.index - 1);
    } else if (event.key === 'Tab') {
      // Keep focus inside the bubble while the tour is open.
      const focusable = [...open.bubble.querySelectorAll('button')];
      const at = focusable.indexOf(document.activeElement);
      const to = event.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : (at + 1) % focusable.length;
      event.preventDefault();
      focusable[to].focus();
    }
  };

  return {
    isOpen: () => open !== null,
    /** Start (or restart) the tour from the first step. */
    start() {
      if (open) close();
      const spotlight = el('div', { className: 'tour__spotlight' });
      const gesture = el('div', { className: 'tour__gesture', attrs: { 'aria-hidden': 'true' } }, [el('span', { className: 'tour__finger' })]);
      spotlight.append(gesture);
      const bubble = el('div', { className: 'tour__bubble', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-describedby': 'tour-body' } });
      const root = el('div', { className: 'tour' }, [spotlight, bubble]);
      root.dataset.testid = 'tour';
      bubble.dataset.testid = 'tour-bubble';
      root.addEventListener('keydown', onKey);
      document.body.append(root);
      open = { index: 0, root, spotlight, bubble, gesture, returnFocus: document.activeElement };
      window.addEventListener('resize', position);
      render();
    },
    /** Start only if this browser has not seen (finished or skipped) the tour. */
    startIfFirstVisit() {
      if (!tourSeen(storage)) this.start();
    },
    close,
  };
}
