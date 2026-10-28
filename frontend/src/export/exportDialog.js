// "PDF for your carpenter" dialog: pick the document language, download dimensioned drawings plus a
// component list. It is a design drawing to explain the intent, never a claim of manufacturability.
import { el, button, selectField } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { exportPdf } from '../api/client.js';
import { strings } from '../ui/i18n.js';

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
export function createExportDialog({ getDesign, getLanguage, getSnapshot = null, exportImpl = exportPdf }) {
  const t = strings();
  let language = getLanguage();
  let busy = false;
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'export-status';
  const languageField = selectField({
    label: t.documentLanguage,
    options: [{ label: 'עברית', value: 'he' }, { label: 'English', value: 'en' }],
    value: language,
    onChange: (value) => { language = value; },
    testId: 'export-language',
  });
  const select = languageField.querySelector('select');
  const download = button(t.downloadPdf, async () => {
    if (busy) return;
    busy = true;
    download.disabled = true;
    status.textContent = t.preparingPdf;
    try {
      const design = getDesign();
      let image = null;
      try {
        image = getSnapshot ? getSnapshot(design) : null;
      } catch {
        image = null; // no WebGL here: the PDF falls back to its drawn illustration
      }
      const { blob, filename } = await exportImpl({ design, language, image });
      saveBlob(blob, filename);
      status.textContent = t.pdfDownloading;
    } catch (error) {
      status.textContent = error?.message || t.pdfFailed;
    } finally {
      busy = false;
      download.disabled = false;
    }
  }, { variant: 'primary', testId: 'export-download' });

  const dialog = createDialog({
    title: t.exportTitle,
    labelId: 'export-dialog-title',
    testId: 'export-dialog',
    body: [
      el('p', { className: 'dialog__text', text: t.exportText }),
      languageField,
      el('span', { className: 'chip', text: t.exportNote }),
      status,
    ],
    actions: [download, button(t.close, () => dialog.close(), { variant: 'ghost', testId: 'export-close' })],
  });
  return {
    ...dialog,
    open() {
      language = getLanguage(); // each time: follow the current chat language
      select.value = language;
      if (!busy) status.textContent = '';
      dialog.open();
    },
  };
}
