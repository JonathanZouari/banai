// Step 5: free-text notes and special requests for the carpenter. Kept in the store's request data
// (not the design), cleaned and capped there; the counter and the step summary update as you type.
import { el } from './fields.js';
import { MAX_NOTES } from '../state/request.js';
import { t } from '../ui/i18n.js';

/** `getNotes()` / `setNotes(text)` read and write the store; `onChange(notes)` refreshes the summary. */
export function notesGroup({ getNotes, setNotes, onChange }) {
  const s = t().editor;
  const id = 'notes-input';
  const textarea = el('textarea', {
    className: 'field__input notes__input',
    attrs: { id, rows: '4', dir: 'auto', maxlength: String(MAX_NOTES), placeholder: s.notesHint, 'aria-describedby': `${id}-count` },
  });
  textarea.dataset.testid = 'notes-input';
  textarea.value = getNotes();
  const counter = el('p', { className: 'notes__count', attrs: { id: `${id}-count` } });
  counter.dataset.testid = 'notes-count';
  const showCount = (text) => { counter.textContent = s.notesCount(text.length, MAX_NOTES); };
  showCount(textarea.value);
  textarea.addEventListener('input', () => {
    const clean = setNotes(textarea.value);
    if (clean !== textarea.value) textarea.value = clean; // hidden or reordering characters are dropped
    showCount(clean);
    onChange(clean);
  });
  return el('div', { className: 'prop-group field' }, [
    el('label', { className: 'field__label', text: s.notesLabel, attrs: { for: id } }),
    textarea,
    counter,
  ]);
}
