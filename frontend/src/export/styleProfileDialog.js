// "PDF for your carpenter" (Generate Style Profile): the server renders dimensioned drawings plus a
// component list. It is a design drawing to explain the intent, never a claim of manufacturability.
// Opened from the chat (the agent's offer, or the note after a confirmed proposal); the header's
// Export button keeps the browser-built design specification (export/exportDialog.js).
import { el, button, selectField } from '../editor/fields.js';
import { language as appLanguage, translate } from '../i18n/strings.js';
import { createDialog } from '../ui/dialog.js';
import { exportPdf } from '../api/client.js';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** getSnapshot() returns the 3D picture as a data URL, or throws (the PDF then uses its own drawing). */
export function createStyleProfileDialog({ getDesign, getSnapshot = null, exportImpl = exportPdf, language = appLanguage }) {
  const t = (key) => translate(language.get(), key);
  let documentLanguage = language.get();
  let busy = false;
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'profile-status';
  const intro = el('p', { className: 'dialog__text' });
  const note = el('span', { className: 'chip' });
  const languageField = selectField({
    label: '',
    options: [{ label: 'עברית', value: 'he' }, { label: 'English', value: 'en' }],
    value: documentLanguage,
    onChange: (value) => { documentLanguage = value; },
    testId: 'profile-language',
  });
  const select = languageField.querySelector('select');
  const languageLabel = languageField.querySelector('label, .field__label');
  const download = button('', async () => {
    if (busy) return;
    busy = true;
    download.disabled = true;
    status.textContent = t('profilePreparing');
    try {
      const design = getDesign();
      let image = null;
      try {
        image = getSnapshot ? getSnapshot(design) : null;
      } catch {
        image = null; // no WebGL here: the PDF falls back to its drawn illustration
      }
      const { blob, filename } = await exportImpl({ design, language: documentLanguage, image });
      saveBlob(blob, filename);
      status.textContent = t('profileDownloading');
    } catch {
      status.textContent = t('profileFailed');
    } finally {
      busy = false;
      download.disabled = false;
    }
  }, { variant: 'primary', testId: 'profile-download' });
  const close = button('', () => dialog.close(), { variant: 'ghost', testId: 'profile-close' });

  const dialog = createDialog({
    title: '',
    labelId: 'profile-dialog-title',
    testId: 'profile-dialog',
    body: [intro, languageField, note, status],
    actions: [download, close],
  });
  const heading = dialog.element.querySelector('#profile-dialog-title');
  const relabel = () => {
    heading.textContent = t('profileTitle');
    intro.textContent = t('profileIntro');
    note.textContent = t('profileNote');
    if (languageLabel) languageLabel.textContent = t('profileLanguage');
    download.textContent = t('profileDownload');
    close.textContent = t('saveClose');
  };
  language.subscribe(relabel);
  relabel();
  return {
    ...dialog,
    open() {
      documentLanguage = language.get(); // each time: follow the current app language
      select.value = documentLanguage;
      if (!busy) status.textContent = '';
      dialog.open();
    },
  };
}
