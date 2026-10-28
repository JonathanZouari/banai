// Save dialog. Saving stores the design on the server and gives a private link; nothing is faked:
// the link field stays empty until a save has really succeeded. Text follows the selected language.
import { el, button } from '../editor/fields.js';
import { language, t } from '../i18n/strings.js';
import { createDialog } from '../ui/dialog.js';

/**
 * `available`: whether the server can store designs. `onSave()` saves the current design and resolves
 * to its private link. `link`: the link of a design that was reopened from one, if any.
 */
export function createSaveDialog({ available, onSave, link = '' }) {
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '' } });
  linkField.dataset.testid = 'share-link';
  linkField.value = link;
  const intro = el('p', { className: 'dialog__text' });
  const linkLabel = el('label', { className: 'field__label', attrs: { for: 'share-link' } });
  const warn = el('p', { className: 'dialog__note' });
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'save-status';
  // The status shows a key until something more specific (a server error) replaces it.
  let statusKey = available ? 'saveReady' : 'saveUnavailable';

  const setStatus = (key) => {
    statusKey = key;
    status.textContent = t(key);
  };

  const copy = button('', async () => {
    try {
      await navigator.clipboard.writeText(linkField.value);
      setStatus('saveCopied');
    } catch {
      linkField.select(); // clipboard blocked: leave it selected for a manual copy
      setStatus('saveCopyManually');
    }
  }, { variant: 'secondary', testId: 'copy-link', disabled: !link });

  const save = button('', async () => {
    save.disabled = true;
    setStatus('saveSaving');
    try {
      linkField.value = await onSave();
      copy.disabled = false;
      setStatus('saveSaved');
    } catch (error) {
      statusKey = null;
      status.textContent = error?.status ? error.message : t('saveFailed');
    } finally {
      save.disabled = false;
    }
  }, { variant: 'primary', testId: 'save-confirm', disabled: !available });
  const close = button('', () => dialog.close(), { variant: 'ghost', testId: 'save-close' });

  const dialog = createDialog({
    title: '',
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [intro, el('div', { className: 'field' }, [linkLabel, linkField]), warn, status],
    actions: [copy, save, close],
  });
  const heading = dialog.element.querySelector('#save-dialog-title');
  const relabel = () => {
    heading.textContent = t('saveTitle');
    intro.textContent = t('saveIntro');
    linkLabel.textContent = t('savePrivateLink');
    linkField.placeholder = t('savePlaceholder');
    linkField.setAttribute('aria-label', t('savePrivateLink'));
    warn.textContent = t('saveWarn');
    if (statusKey) status.textContent = t(statusKey);
    copy.textContent = t('saveCopy');
    save.textContent = t('saveAction');
    close.textContent = t('saveClose');
  };
  language.subscribe(relabel);
  relabel();
  return dialog;
}
