// The warning pop-up: when a change brings a new warning or critical advisory, a card rises over the 3D
// view with what is wrong and the ways out: the advisory's quick fix, "שאלו את בוב" (the chat opens with
// the question written, for other options), "הצג" and "השאר כך". It is not modal and never blocks the
// choice; the advisory stays in the advice tab either way. Esc keeps the design as it is. Several new
// warnings queue up, one card at a time. The customer can switch pop-ups off (and on again in the
// advice tab). Every text arrives as data and is set with textContent.
import { el } from '../editor/fields.js';
import { askBobText, createAlertTracker, mergeQueue } from './alertQueue.js';

export const POPUPS_KEY = 'banai.advice.popups';

export function loadPopupsOn(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(POPUPS_KEY) !== 'off';
  } catch {
    return true; // storage blocked: pop-ups stay on
  }
}

export function savePopupsOn(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(POPUPS_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/**
 * @param host    element the card is placed in (over the 3D view)
 * @param feed    createAdvisoryFeed() instance
 * @param onFix   (advisory) => void, applies its quick fix
 * @param onShow  (advisory) => void, highlights its targets
 * @param onAsk   (text) => void, opens the chat with `text` written in the composer (not sent)
 */
export function mountAlertSheet(host, { feed, onFix, onShow, onAsk, storage = globalThis.localStorage }) {
  const tracker = createAlertTracker();
  let queue = [];
  let stale = true;
  let on = loadPopupsOn(storage);
  const card = el('section', { className: 'alert-sheet', attrs: { 'aria-live': 'polite', 'aria-label': 'אזהרה על השינוי האחרון' } });
  card.dataset.testid = 'alert-sheet';
  card.hidden = true;
  host.append(card);

  const next = () => {
    queue = queue.slice(1);
    render();
  };

  function render() {
    const item = queue[0];
    if (!item || !on) {
      card.hidden = true;
      card.replaceChildren();
      return;
    }
    const actions = [];
    if (item.fix) {
      const fix = el('button', { className: 'btn btn--sm btn--primary', text: item.fix.label, attrs: { type: 'button' } });
      fix.dataset.testid = 'alert-fix';
      fix.disabled = stale; // the fix was computed for the design the answer came for
      fix.addEventListener('click', () => {
        onFix(item);
        next();
      });
      actions.push(fix);
    }
    const ask = el('button', { className: 'btn btn--sm', text: 'שאלו את בוב', attrs: { type: 'button' } });
    ask.dataset.testid = 'alert-ask';
    ask.addEventListener('click', () => {
      onAsk(askBobText(item));
      next();
    });
    const show = el('button', { className: 'btn btn--sm', text: 'הצג', attrs: { type: 'button' } });
    show.dataset.testid = 'alert-show';
    show.addEventListener('click', () => onShow(item));
    const keep = el('button', { className: 'btn btn--sm btn--ghost', text: 'השאר כך', attrs: { type: 'button' } });
    keep.dataset.testid = 'alert-keep';
    keep.addEventListener('click', next);
    actions.push(ask, show, keep);
    const mute = el('button', { className: 'link-btn alert-sheet__mute', text: 'לא להקפיץ אזהרות', attrs: { type: 'button' } });
    mute.dataset.testid = 'alert-mute';
    mute.addEventListener('click', () => setOn(false));
    const more = queue.length > 1 ? el('span', { className: 'alert-sheet__more', text: `ועוד ${queue.length - 1}` }) : null;
    card.dataset.level = item.level;
    card.replaceChildren(
      el('div', { className: 'alert-sheet__head' }, [
        el('span', { className: 'alert-sheet__eyebrow', text: item.level === 'critical' ? 'הבחירה לא תתאים' : 'שימו לב' }),
        ...(more ? [more] : []),
      ]),
      el('h3', { className: 'alert-sheet__title', text: item.title }),
      el('p', { className: 'alert-sheet__body', text: item.body }),
      el('div', { className: 'alert-sheet__actions' }, actions),
      el('p', { className: 'alert-sheet__foot' }, [document.createTextNode('ההחלטה שלכם. האזהרה נשארת בלשונית הייעוץ. '), mute]),
    );
    card.hidden = false;
  }

  function setOn(value) {
    on = value;
    savePopupsOn(value, storage);
    if (!value) queue = [];
    render();
  }

  const onKey = (event) => {
    if (event.key === 'Escape' && !card.hidden && card.contains(document.activeElement)) next();
  };
  document.addEventListener('keydown', onKey);

  const unsubscribe = feed.subscribe((state) => {
    stale = state.stale;
    const fresh = tracker.next(state);
    if (fresh === null) {
      render(); // only the fix button's state changes while the answer is on its way
      return;
    }
    queue = mergeQueue(queue, state.items, on ? fresh : []);
    render();
  });

  return {
    /** A new or opened project: its advisories are the starting point, not a change. */
    reset() {
      tracker.reset();
      queue = [];
      render();
    },
    setOn,
    get on() {
      return on;
    },
    dispose() {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      card.remove();
    },
  };
}
