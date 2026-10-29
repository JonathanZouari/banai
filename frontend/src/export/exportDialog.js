// "PDF for your carpenter" dialog: pick the document language, download dimensioned drawings plus a
// component list. It is a design drawing to explain the intent, never a claim of manufacturability.
import { el, button, selectField } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { exportPdf } from '../api/client.js';
import { t } from '../ui/i18n.js';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "banai-200x240x60.png": the design's width x height x depth in cm (dimensions are whole mm). */
export function pictureFilename({ dimensions: { width, height, depth } }) {
  const cm = (mm) => String(Math.round(mm) / 10);
  return `banai-${cm(width)}x${cm(height)}x${cm(depth)}.png`;
}

/** A base64 data URL as a Blob, decoded here in the browser (no request is made). */
function dataUrlToBlob(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: /^data:([^;]+)/.exec(head)?.[1] ?? 'image/png' });
}

/**
 * getSnapshot(design, options) returns the 3D picture as a data URL, or throws (the PDF then uses its own drawing).
 * getRequest() returns the customer's notes and measured wall (or null) for the requirements page.
 */
export function createExportDialog({ getDesign, getLanguage, getSnapshot = null, getRequest = () => null, exportImpl = exportPdf }) {
  const s = t().dialogs.export;
  let language = getLanguage();
  let busy = false;
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'export-status';
  const languageField = selectField({
    label: s.language,
    options: [{ label: 'עברית', value: 'he' }, { label: 'English', value: 'en' }, { label: 'Español', value: 'es' }],
    value: language,
    onChange: (value) => { language = value; },
    testId: 'export-language',
  });
  const select = languageField.querySelector('select');
  const download = button(s.download, async () => {
    if (busy) return;
    busy = true;
    download.disabled = true;
    status.textContent = s.preparing;
    try {
      const design = getDesign();
      let image = null;
      try {
        image = getSnapshot ? getSnapshot(design) : null;
      } catch {
        image = null; // no WebGL here: the PDF falls back to its drawn illustration
      }
      const { blob, filename } = await exportImpl({ design, language, image, request: getRequest() });
      saveBlob(blob, filename);
      status.textContent = s.downloading;
    } catch (error) {
      status.textContent = error?.message || s.failed;
    } finally {
      busy = false;
      download.disabled = false;
    }
  }, { variant: 'primary', testId: 'export-download' });

  // The same studio picture that goes into the PDF, saved as a PNG. It is made and saved in the browser only.
  const picture = getSnapshot
    ? button(s.picture, () => {
      try {
        const design = getDesign();
        saveBlob(dataUrlToBlob(getSnapshot(design, { type: 'image/png' })), pictureFilename(design));
        status.textContent = s.pictureSaved;
      } catch {
        status.textContent = s.pictureFailed;
      }
    }, { variant: 'secondary', testId: 'export-picture' })
    : null;

  const dialog = createDialog({
    title: s.title,
    labelId: 'export-dialog-title',
    testId: 'export-dialog',
    body: [
      el('p', { className: 'dialog__text', text: s.intro }),
      languageField,
      el('span', { className: 'chip', text: s.note }),
      status,
    ],
    actions: [download, ...(picture ? [picture] : []), button(t().dialogs.close, () => dialog.close(), { variant: 'ghost', testId: 'export-close' })],
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
