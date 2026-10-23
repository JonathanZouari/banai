// Advisory panel (port of the P1 prototype): research-backed, non-blocking guidance from
// POST /api/advisories. Cards are keyed by advisory id, so a card that stays keeps its place and
// only new ones animate in. Every text arrives as data and is set with textContent.
//
// "Show" highlights the targets in 3D; a quick fix applies its ops through the store like any
// manual edit (so it can be undone). While the feed is stale (the design changed and the answer
// for it has not arrived) the fix buttons are disabled: their ops were computed for an older design.
import { artNode } from '../editor/art.js';
import { el } from '../editor/fields.js';

const ICONS = Object.freeze({
  critical: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="currentColor"/><path d="M10 5.6v5.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/><circle cx="10" cy="14" r="1.15" fill="#fff"/></svg>',
  warn: '<svg viewBox="0 0 20 20"><path d="M8.6 2.9a1.6 1.6 0 0 1 2.8 0l6.9 12.2a1.6 1.6 0 0 1-1.4 2.4H3.1a1.6 1.6 0 0 1-1.4-2.4z" fill="currentColor"/><path d="M10 7v4.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.4" r="1.05" fill="#fff"/></svg>',
  info: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="6.4" r="1.05" fill="currentColor"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
});
const LEAVE_MS = 240;

function levelIcon(level) {
  const node = artNode(ICONS[level]);
  node.setAttribute('class', 'advice-icon');
  return node;
}

/** "2 אזהרות" style counts for the header and the tab badge. */
export function countLevels(items) {
  const count = (level) => items.filter((item) => item.level === level).length;
  return { critical: count('critical'), warn: count('warn'), info: count('info') };
}

/**
 * @param root      container element
 * @param feed      createAdvisoryFeed() instance
 * @param onFix     (advisory) => result of applying its ops
 * @param onShow    (advisory) => void
 */
export function mountAdvisoryPanel(root, { feed, onFix, onShow }) {
  const counts = el('div', { className: 'advice-counts', attrs: { 'aria-live': 'polite' } });
  const status = el('p', { className: 'advice-status', attrs: { role: 'status' } });
  const list = el('div', { className: 'advice-list', attrs: { 'data-testid': 'advice-list' } });
  const retry = el('button', { className: 'btn btn--sm', text: 'נסו שוב', attrs: { type: 'button' } });
  retry.addEventListener('click', () => feed.retry());
  root.replaceChildren(
    el('header', { className: 'advice-head' }, [
      el('div', {}, [
        el('h2', { className: 'advice-title', text: 'ייעוץ מקצועי' }),
        el('p', { className: 'advice-sub', text: 'מתעדכן עם כל שינוי · מבוסס על 116 מקורות' }),
      ]),
      counts,
    ]),
    status,
    list,
    el('footer', { className: 'advice-foot', text: 'הנחיה כללית, לא אישור הנדסי. דרגת הראיה והמקור מופיעים בכל הערה, ומספרי המקור מפנים למסמך המחקר.' }),
  );

  const cards = new Map();

  function fill(wrap, item, stale) {
    const meta = el('div', { className: 'advice-meta' }, [
      el('span', { className: 'advice-grade', text: item.grade }),
      el('span', { className: 'advice-src', text: item.src }),
      el('span', { className: 'advice-spacer' }),
    ]);
    const show = el('button', { className: 'link-btn', text: 'הצג', attrs: { type: 'button', 'data-testid': `advice-show-${item.id}` } });
    show.addEventListener('click', () => onShow(item));
    meta.append(show);
    if (item.fix) {
      const fix = el('button', { className: 'fix-btn', text: item.fix.label, attrs: { type: 'button', 'data-testid': `advice-fix-${item.id}` } });
      fix.disabled = stale;
      fix.title = stale ? 'מתעדכן…' : '';
      fix.addEventListener('click', () => onFix(item));
      meta.append(fix);
    }
    const card = el('article', { className: `advice advice--${item.level}`, attrs: { 'data-testid': `advice-${item.id}`, 'data-level': item.level } }, [
      el('div', { className: 'advice-inner' }, [
        levelIcon(item.level),
        el('div', { className: 'advice-main' }, [
          el('h3', { className: 'advice-card-title', text: item.title }),
          el('p', { className: 'advice-text', text: item.body }),
          meta,
        ]),
      ]),
    ]);
    wrap.replaceChildren(card);
  }

  function renderCounts(items) {
    const { critical, warn, info } = countLevels(items);
    const chips = [];
    if (critical) chips.push(el('span', { className: 'count count--critical', text: `${critical} חוסם` }));
    if (warn) chips.push(el('span', { className: 'count count--warn', text: `${warn} ${warn === 1 ? 'אזהרה' : 'אזהרות'}` }));
    if (!critical && !warn) chips.push(el('span', { className: 'count count--ok', text: 'אין אזהרות' }));
    chips.push(el('span', { className: 'count count--info', text: `${info} מידע` }));
    counts.replaceChildren(...chips);
  }

  function render(state) {
    root.classList.toggle('is-stale', state.stale);
    status.hidden = state.status !== 'error' && state.status !== 'loading';
    if (state.status === 'error') status.replaceChildren(document.createTextNode('הייעוץ לא זמין כרגע. '), retry);
    else if (state.status === 'loading') status.textContent = 'טוען ייעוץ…';
    if (state.status === 'loading' || (state.status === 'error' && !state.items.length)) return;

    const ids = new Set(state.items.map((item) => item.id));
    for (const [id, wrap] of cards) {
      if (ids.has(id)) continue;
      cards.delete(id);
      wrap.classList.add('is-leaving');
      setTimeout(() => wrap.remove(), LEAVE_MS);
    }
    let previous = null;
    for (const item of state.items) {
      let wrap = cards.get(item.id);
      if (!wrap) {
        wrap = el('div', { className: 'advice-wrap is-entering' });
        cards.set(item.id, wrap);
        requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove('is-entering')));
      }
      fill(wrap, item, state.stale);
      const want = previous ? previous.nextElementSibling : list.firstElementChild;
      if (want !== wrap) list.insertBefore(wrap, want);
      previous = wrap;
    }
    renderCounts(state.items);
  }

  const unsubscribe = feed.subscribe(render);
  render(feed.getState());
  return { dispose: unsubscribe };
}
