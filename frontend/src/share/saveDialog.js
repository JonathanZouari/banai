// Save dialog. Saving needs the backend (Phase 7), so its actions are disabled and say so. Nothing is
// faked: no link is shown until a design has really been saved. Text follows the selected language.
import { el, button } from '../editor/fields.js';
import { language, t } from '../i18n/strings.js';
import { createDialog } from '../ui/dialog.js';

export function createSaveDialog() {
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '' } });
  linkField.dataset.testid = 'share-link';
  const intro = el('p', { className: 'dialog__text' });
  const linkLabel = el('label', { className: 'field__label', attrs: { for: 'share-link' } });
  const warn = el('p', { className: 'dialog__note' });
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  const save = button('', () => {}, { variant: 'primary', testId: 'save-confirm', disabled: true });
  const close = button('', () => dialog.close(), { variant: 'ghost', testId: 'save-close' });
  const dialog = createDialog({
    title: '',
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [intro, el('div', { className: 'field' }, [linkLabel, linkField]), warn, status],
    actions: [save, close],
  });
  const heading = dialog.element.querySelector('#save-dialog-title');
  const relabel = () => {
    heading.textContent = t('saveTitle');
    intro.textContent = t('saveIntro');
    linkLabel.textContent = t('savePrivateLink');
    linkField.placeholder = t('savePlaceholder');
    linkField.setAttribute('aria-label', t('savePrivateLink'));
    warn.textContent = t('saveWarn');
    status.textContent = t('saveSoon');
    save.textContent = t('saveAction');
    close.textContent = t('saveClose');
  };
  language.subscribe(relabel);
  relabel();
  return dialog;
}
