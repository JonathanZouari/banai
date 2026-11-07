// Save and share dialog. Saving stores the design on the server and gives a private link; nothing is
// faked: the link field stays empty until a save has really succeeded.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { t } from '../ui/i18n.js';

/**
 * `available`: whether the server can store designs. `onSave()` saves the current design and resolves
 * to its private link. `link`: the link of a design that was reopened from one, if any.
 */
export function createSaveDialog({ available, onSave, link = '' }) {
  const s = t().dialogs.save;
  const linkField = el('input', { className: 'field__input', attrs: { id: 'share-link', type: 'text', readonly: '', dir: 'ltr', placeholder: s.linkPlaceholder, 'aria-label': s.linkAria } });
  linkField.dataset.testid = 'share-link';
  linkField.value = link;
  const status = el('p', { className: 'dialog__status', text: available ? s.ready : s.unavailable, attrs: { role: 'status' } });
  status.dataset.testid = 'save-status';

  const copy = button(s.copy, async () => {
    try {
      await navigator.clipboard.writeText(linkField.value);
      status.textContent = s.copied;
    } catch {
      linkField.select(); // clipboard blocked: leave it selected for a manual copy
      status.textContent = s.copyManual;
    }
  }, { variant: 'secondary', testId: 'copy-link', disabled: !link });

  // The system share sheet; browsers without navigator.share never see the button.
  const share = typeof navigator.share === 'function' ? button(s.share, async () => {
    try {
      await navigator.share({ title: s.shareTitle, url: linkField.value });
    } catch (error) {
      if (error?.name !== 'AbortError') status.textContent = s.shareFailed;
    }
  }, { variant: 'secondary', testId: 'share-link-native', disabled: !link }) : null;

  const save = button(s.confirm, async () => {
    save.disabled = true;
    status.textContent = s.saving;
    try {
      linkField.value = await onSave();
      copy.disabled = false;
      if (share) share.disabled = false;
      status.textContent = s.saved;
    } catch (error) {
      status.textContent = error?.message || s.failed;
    } finally {
      save.disabled = false;
    }
  }, { variant: 'primary', testId: 'save-confirm', disabled: !available });

  const dialog = createDialog({
    title: s.title,
    labelId: 'save-dialog-title',
    testId: 'save-dialog',
    body: [
      el('p', { className: 'dialog__text', text: s.intro }),
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: s.linkLabel, attrs: { for: 'share-link' } }),
        linkField,
      ]),
      el('p', { className: 'dialog__note', text: s.note }),
      status,
    ],
    actions: [copy, ...(share ? [share] : []), save, button(t().dialogs.close, () => dialog.close(), { variant: 'ghost', testId: 'save-close' })],
  });
  return dialog;
}
