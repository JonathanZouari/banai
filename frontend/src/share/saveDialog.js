// Save and share dialog. Saving stores the design on the server and gives a private link; nothing is
// faked: the link field stays empty until a save has really succeeded.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { strings } from '../ui/i18n.js';

/**
 * `available`: whether the server can store designs. `onSave()` saves the current design and resolves
 * to its private link. `link`: the link of a design that was reopened from one, if any.
 */
export function createSaveDialog({ available, onSave, link = '' }) {
  const t = strings();
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '', placeholder: t.linkPlaceholder, 'aria-label': t.privateLinkLabel } });
  linkField.dataset.testid = 'share-link';
  linkField.value = link;
  const status = el('p', { className: 'dialog__status', text: available ? t.saveReady : t.saveUnavailable, attrs: { role: 'status' } });
  status.dataset.testid = 'save-status';

  const copy = button(t.copyLink, async () => {
    try {
      await navigator.clipboard.writeText(linkField.value);
      status.textContent = t.linkCopied;
    } catch {
      linkField.select(); // clipboard blocked: leave it selected for a manual copy
      status.textContent = t.copyManually;
    }
  }, { variant: 'secondary', testId: 'copy-link', disabled: !link });

  const save = button(t.saveDesign, async () => {
    save.disabled = true;
    status.textContent = t.saving;
    try {
      linkField.value = await onSave();
      copy.disabled = false;
      status.textContent = t.saved;
    } catch (error) {
      status.textContent = error?.message || t.saveFailed;
    } finally {
      save.disabled = false;
    }
  }, { variant: 'primary', testId: 'save-confirm', disabled: !available });

  const dialog = createDialog({
    title: t.saveTitle,
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [
      el('p', { className: 'dialog__text', text: t.saveText }),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: t.privateLink, attrs: { for: 'share-link' } }),
        linkField,
      ]),
      el('p', { className: 'dialog__note', text: t.linkNote }),
      status,
    ],
    actions: [copy, save, button(t.close, () => dialog.close(), { variant: 'ghost', testId: 'save-close' })],
  });
  return dialog;
}
