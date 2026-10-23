// Design summary card: read-only totals computed from the committed design, never from agent
// text. It is built once and kept across panel re-renders, so its live region stays in the page.
// Screen readers hear only the values that changed, once a burst of edits settles.
import { designSummary } from '../domain/geometry.js';
import { cm } from '../viewer/format.js';
import { el } from './fields.js';

export const ANNOUNCE_DELAY_MS = 500;

const LITRES = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const formatLitres = (mm3) => `${LITRES.format(mm3 / 1_000_000)} L`;
export const formatLength = (mm) => `${cm(mm)} cm`;

const ROWS = Object.freeze([
  ['compartments', 'Compartments', String],
  ['shelves', 'Shelves', String],
  ['drawers', 'Drawers', String],
  ['rails', 'Hanging rails', String],
  ['interiorVolumeMm3', 'Interior volume', formatLitres],
  ['hangingLengthMm', 'Hanging length', formatLength],
]);

/** The card's rows as display text: [{ key, label, value }]. */
export const formatSummary = (summary) =>
  ROWS.map(([key, label, format]) => ({ key, label, value: format(summary[key]) }));

/** What a screen reader hears after a change: only rows whose shown value changed, or ''. */
export function describeChanges(previous, next) {
  const before = new Map(formatSummary(previous).map((row) => [row.key, row.value]));
  const changed = formatSummary(next).filter((row) => before.get(row.key) !== row.value);
  return changed.length ? `Design summary: ${changed.map((row) => `${row.label} ${row.value}`).join(', ')}.` : '';
}

export function summarySection(store, { delay = ANNOUNCE_DELAY_MS } = {}) {
  const titleId = 'design-summary-title';
  const values = new Map();
  const list = el('dl', { className: 'summary-list' }, ROWS.map(([key, label]) => {
    const value = el('dd', { className: 'summary-list__value', attrs: { 'data-testid': `summary-${key}` } });
    values.set(key, value);
    return el('div', { className: 'summary-list__row' }, [el('dt', { className: 'summary-list__label', text: label }), value]);
  }));
  const status = el('p', { className: 'visually-hidden', attrs: { role: 'status', 'aria-atomic': 'true', 'data-testid': 'summary-status' } });
  const node = el('section', { className: 'prop-section summary-card', attrs: { 'aria-labelledby': titleId, 'data-testid': 'design-summary' } }, [
    el('h3', { className: 'prop-section__title', text: 'Design summary', attrs: { id: titleId } }),
    list,
    el('p', { className: 'summary-card__note', text: 'Gross interior space from the design, before shelves and drawers. Not a manufacturing calculation.' }),
    status,
  ]);

  let design = null;
  let announced = null; // the summary screen readers last heard about
  let timer = null;
  const announce = () => {
    timer = null;
    const current = designSummary(design);
    const message = describeChanges(announced, current);
    announced = current;
    if (message) status.textContent = message;
  };

  const render = (state) => {
    if (state.design === design) return; // selection-only changes leave the card alone
    design = state.design;
    const summary = designSummary(design);
    formatSummary(summary).forEach(({ key, value }) => { values.get(key).textContent = value; });
    if (announced === null) {
      announced = summary; // the first render is not news
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(announce, delay);
  };

  const unsubscribe = store.subscribe(render);
  render(store.getState());
  return {
    node,
    destroy() {
      unsubscribe();
      clearTimeout(timer);
    },
  };
}
