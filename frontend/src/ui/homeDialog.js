// Confirmation before leaving the editor for the start screen. Designs are not persisted
// until the user saves a share link, so going home discards the current design.
import { el } from '../editor/fields.js';
import { createDialog } from './dialog.js';

export function createHomeDialog({ onConfirm }) {
  const stay = el('button', { className: 'btn btn--tonal', text: 'Back to editing', attrs: { type: 'button' } });
  const leave = el('button', { className: 'btn btn--primary', text: 'Yes, go to the home page', attrs: { type: 'button' } });
  stay.dataset.testid = 'home-stay';
  leave.dataset.testid = 'home-leave';
  const dialog = createDialog({
    title: 'Leave the editor?',
    body: [
      el('p', { text: 'If you go back to the home page, your current design will not be saved. Use Save first if you want to keep it.' }),
    ],
    actions: [stay, leave],
    testId: 'home-dialog',
    labelId: 'home-dialog-title',
  });
  stay.addEventListener('click', dialog.close);
  leave.addEventListener('click', () => {
    dialog.close();
    onConfirm();
  });
  return dialog;
}
