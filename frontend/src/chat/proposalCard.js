// Proposal card: what will change, with Confirm / Cancel. Pure DOM render from { proposal, status }.
// All text uses textContent (proposal text is untrusted data).
//
// The list comes from the designs (`diff`, see proposalDiff.js), not from the agent's text; the
// agent's one-line summary stays above it as context. When no diff can be computed (nothing to
// replay, or the ops are refused) the agent's own rows are shown instead. A stale proposal shows
// no list at all, so it never describes changes against a design that has moved on.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { renderChangeList } from './changeList.js';
import { DEFAULT_LANGUAGE, STRINGS } from './i18n.js';

const languageOf = (t) => Object.keys(STRINGS).find((code) => STRINGS[code] === t) ?? DEFAULT_LANGUAGE;

function agentRows(proposal) {
  return el('ul', { className: 'proposal__list' }, proposal.changes.map((change) => el('li', { className: 'proposal__row' }, [
    el('span', { className: 'proposal__title', text: change.title }),
    el('span', { className: 'proposal__detail', text: change.detail }),
  ])));
}

export function renderProposalCard(proposal, status, { onConfirm, onCancel, strings: t = STRINGS.he, diff = null }) {
  const stale = status === 'stale';
  const changes = stale || !diff ? null : diff.changesFor(proposal);
  let list = null;
  let count = 0;
  if (changes) {
    list = renderChangeList(changes, { language: proposal.language ?? languageOf(t), catalog: diff.catalog() }).element;
    count = changes.length;
  } else if (!stale) {
    list = agentRows(proposal);
    count = proposal.changes.length;
  }

  const confirm = el('button', { className: 'btn btn--primary', attrs: { type: 'button' } }, [icon('check', { size: 18 }), document.createTextNode(` ${t.confirm}`)]);
  confirm.dataset.testid = 'proposal-confirm';
  confirm.disabled = stale;
  confirm.addEventListener('click', () => onConfirm(proposal));

  const cancel = el('button', { className: 'btn', text: t.cancel, attrs: { type: 'button' } });
  cancel.dataset.testid = 'proposal-cancel';
  cancel.addEventListener('click', () => onCancel(proposal));

  const card = el('section', { className: `proposal${stale ? ' proposal--stale' : ''}`, attrs: { 'aria-label': t.proposalHeading, dir: t.dir } }, [
    el('header', { className: 'proposal__header' }, [
      el('h3', { className: 'proposal__heading', text: t.proposalHeading }),
      ...(count ? [el('span', { className: 'proposal__count', text: t.changeCount(count) })] : []),
    ]),
    el('p', { className: 'proposal__summary', text: proposal.summary }),
    ...(list ? [list] : []),
    el('p', { className: 'proposal__note', text: t.proposalNote }),
    el('div', { className: 'button-row' }, [confirm, cancel]),
  ]);
  card.dataset.testid = 'proposal-card';

  if (stale) {
    card.append(el('p', { className: 'proposal__stale', text: t.stale, attrs: { role: 'status' } }));
  }
  return card;
}
