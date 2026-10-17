// Save and share dialog. Saving needs the backend (Phase 7), so every action here is disabled and
// says so. Nothing is faked: no link is shown until a design has really been saved.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

export function createSaveDialog() {
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '', placeholder: 'הקישור הפרטי שלכם יופיע כאן', 'aria-label': 'קישור פרטי' } });
  linkField.dataset.testid = 'share-link';
  const dialog = createDialog({
    title: 'שמירת התכנון',
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'השמירה נותנת קישור פרטי, שאיתו אפשר לחזור לתכנון ולהמשיך לערוך. לא צריך חשבון.' }),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: 'קישור פרטי', attrs: { for: 'share-link' } }),
        linkField,
      ]),
      el('p', { className: 'dialog__note', text: 'כל מי שיש לו את הקישור יכול לערוך את התכנון, אז שמרו אותו לעצמכם.' }),
      el('p', { className: 'dialog__status', text: 'השמירה עוד לא זמינה. היא מגיעה בשלב של Supabase.', attrs: { role: 'status' } }),
    ],
    actions: [
      button('העתקת הקישור', () => {}, { variant: 'secondary', testId: 'copy-link', disabled: true }),
      button('שמירה', () => {}, { variant: 'primary', testId: 'save-confirm', disabled: true }),
      button('סגירה', () => dialog.close(), { variant: 'ghost', testId: 'save-close' }),
    ],
  });
  return dialog;
}
