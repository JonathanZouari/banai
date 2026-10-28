// "What will change": the computed diff as grouped rows (Wardrobe, Compartment N, Doors). Each row
// shows an icon badge (+ / − / ↻) and text, so colour never carries the meaning alone. Screen
// readers get one plain sentence per row; the visual part (arrows, struck values) is hidden from them.
// Long lists show the first few rows and a "+ N more changes" toggle. With `preview`, hovering or
// focusing a row outlines the parts it affects in 3D (viewer.preview: read-only, no selection).
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { groupChanges } from '../domain/diff.js';
import { diffStringsFor } from './diffStrings.js';
import { describeChange, groupLabel } from './diffText.js';

export const VISIBLE_CHANGES = 5;
const BADGE = Object.freeze({ added: 'plus', removed: 'minus', changed: 'changed', moved: 'changed' });
let listCount = 0;

function renderRow(change, text, preview) {
  const body = [el('span', { className: 'diff__label', text: text.label })];
  if (text.after !== undefined) {
    const arrow = icon('arrow', { size: 16 });
    arrow.classList.add('diff__arrow');
    body.push(el('span', { className: 'diff__values' }, [
      ...(text.before !== undefined ? [el('span', { className: 'diff__value diff__before', text: text.before }), arrow] : []),
      el('span', { className: 'diff__value diff__after', text: text.after }),
    ]));
  }
  if (text.detail) body.push(el('span', { className: 'diff__detail', text: text.detail }));
  const row = el('li', { className: `diff__row diff__row--${change.type}` }, [
    el('span', { className: 'diff__badge', attrs: { 'aria-hidden': 'true' } }, [icon(BADGE[change.type], { size: 16 })]),
    el('span', { className: 'visually-hidden', text: text.spoken }),
    el('span', { className: 'diff__body', attrs: { 'aria-hidden': 'true' } }, body),
  ]);
  row.dataset.testid = 'proposal-change';
  row.dataset.type = change.type;
  if (preview && change.focus.length) {
    row.tabIndex = 0;
    row.classList.add('diff__row--focusable');
    const show = () => preview(change.focus);
    const hide = () => preview([]);
    row.addEventListener('mouseenter', show);
    row.addEventListener('focus', show);
    row.addEventListener('mouseleave', hide);
    row.addEventListener('blur', hide);
  }
  return row;
}

/** Returns { element, rows: [{ row, change }] }. `language` is the card's language. */
export function renderChangeList(changes, { language, catalog, preview = null }) {
  const s = diffStringsFor(language);
  if (changes.length === 0) {
    return { element: el('p', { className: 'diff__none', text: s.none }), rows: [] };
  }
  listCount += 1;
  const listId = `diff-${listCount}`;
  const rows = [];
  const groups = groupChanges(changes).map(({ group, changes: items }, gi) => {
    const labelId = `${listId}-g${gi}`;
    const groupRows = items.map((change) => {
      const row = renderRow(change, describeChange(change, language, catalog), preview);
      rows.push({ row, change });
      return row;
    });
    const item = el('li', { className: 'diff__group' }, [
      el('span', { className: 'diff__group-label', text: groupLabel(group, language), attrs: { id: labelId } }),
      el('ul', { className: 'diff__rows', attrs: { 'aria-labelledby': labelId } }, groupRows),
    ]);
    return { item, rows: groupRows };
  });
  const list = el('ul', { className: 'diff', attrs: { id: listId } }, groups.map((g) => g.item));
  list.dataset.testid = 'proposal-changes';

  // One hidden row is not worth a button: show it.
  const hidden = rows.length - VISIBLE_CHANGES;
  const show = (all) => {
    rows.forEach(({ row }, i) => {
      row.hidden = !all && hidden > 1 && i >= VISIBLE_CHANGES;
      row.style.setProperty('--i', String(i >= VISIBLE_CHANGES ? i - VISIBLE_CHANGES : i)); // revealed rows stagger from 0
    });
    groups.forEach((g) => { g.item.hidden = g.rows.every((row) => row.hidden); });
  };
  show(false);
  if (hidden <= 1) return { element: list, rows };

  let expanded = false;
  const more = el('button', { className: 'diff__more', text: s.more(hidden), attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': listId } });
  more.dataset.testid = 'proposal-more';
  more.addEventListener('click', () => {
    expanded = !expanded;
    show(expanded);
    more.textContent = expanded ? s.fewer : s.more(hidden);
    more.setAttribute('aria-expanded', String(expanded));
  });
  return { element: el('div', { className: 'diff-block' }, [list, more]), rows };
}
