// Proposal card: a structured list of proposed changes with Confirm / Cancel. Pure DOM render
// from { proposal, status }. All text uses textContent (proposal text is untrusted data).
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { STALE_MESSAGE } from './chatModel.js';

export function renderProposalCard(proposal, status, { onConfirm, onCancel }) {
  const stale = status === 'stale';
  const rows = proposal.changes.map((change) => el('li', { className: 'proposal__row' }, [
    el('span', { className: 'proposal__title', text: change.title }),
    el('span', { className: 'proposal__detail', text: change.detail }),
  ]));

  const confirm = el('button', { className: 'btn btn--primary', attrs: { type: 'button' } }, [icon('check', { size: 18 }), document.createTextNode(' אישור')]);
  confirm.dataset.testid = 'proposal-confirm';
  confirm.disabled = stale;
  confirm.addEventListener('click', () => onConfirm(proposal));

  const cancel = el('button', { className: 'btn', text: 'ביטול', attrs: { type: 'button' } });
  cancel.dataset.testid = 'proposal-cancel';
  cancel.addEventListener('click', () => onCancel(proposal));

  const card = el('section', { className: `proposal${stale ? ' proposal--stale' : ''}`, attrs: { 'aria-label': 'שינויים מוצעים' } }, [
    el('header', { className: 'proposal__header' }, [
      el('h3', { className: 'proposal__heading', text: 'שינויים מוצעים' }),
      el('span', { className: 'proposal__count', text: proposal.changes.length === 1 ? 'שינוי אחד' : `${proposal.changes.length} שינויים` }),
    ]),
    el('p', { className: 'proposal__summary', text: proposal.summary }),
    el('ul', { className: 'proposal__list' }, rows),
    ...(proposal.impact ? [el('p', { className: 'proposal__impact', text: proposal.impact, attrs: { 'data-testid': 'proposal-impact' } })] : []),
    el('p', { className: 'proposal__note', text: 'עוד לא הוחל. אשרו כדי להחיל את השינויים על התכנון.' }),
    el('div', { className: 'button-row' }, [confirm, cancel]),
  ]);
  card.dataset.testid = 'proposal-card';

  if (stale) {
    card.append(el('p', { className: 'proposal__stale', text: STALE_MESSAGE, attrs: { role: 'status' } }));
  }
  return card;
}
