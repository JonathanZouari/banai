// Design summary card: counts and derived figures, recomputed from the design on every render.
// Illustrative only: no prices, and no claim that the design is manufacturable.
import { designSummary } from '../domain/geometry.js';
import { el, section } from './fields.js';

export function summarySection({ design }) {
  const s = designSummary(design);
  const rows = [
    ['Compartments', s.compartments, 'compartments'],
    ['Shelves', s.shelves, 'shelves'],
    ['Drawers', s.drawers, 'drawers'],
    ['Hanging rails', s.rails, 'rails'],
    ['Interior volume', `${s.interiorLitres.toLocaleString('en-US')} L`, 'volume'],
    ['Total hanging length', `${(s.hangingLengthMm / 10).toFixed(1)} cm`, 'hanging'],
  ];
  const list = el('dl', { className: 'summary-list' }, rows.flatMap(([label, value, key]) => [
    el('dt', { text: label }),
    el('dd', { text: String(value), attrs: { 'data-testid': `summary-${key}` } }),
  ]));
  return section('Summary', [list, el('p', { className: 'panel__hint', text: 'Approximate figures for illustration.' })]);
}
