// Export dialog: builds the PDF specification in the browser and downloads it. Everything happens
// client-side; nothing is uploaded and the design is never changed.
import { button, el } from '../editor/fields.js';
import { language, t } from '../i18n/strings.js';
import { createDialog } from '../ui/dialog.js';
import { units } from '../ui/units.js';
import { assertTrueType } from './fontCheck.js';
import { buildSpec } from './specModel.js';

const FONT_FILES = Object.freeze({ regular: 'Rubik-Regular.ttf', medium: 'Rubik-Medium.ttf' });

async function fetchFont(file) {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
  if (!response.ok) throw new Error(`font ${file}: ${response.status}`);
  const bytes = await response.arrayBuffer();
  assertTrueType(bytes);
  return bytes;
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: fileName } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function createExportDialog({ store, viewer }) {
  const intro = el('p', { className: 'dialog__text' });
  const note = el('p', { className: 'dialog__note' });
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'export-status';
  let busy = false;

  const run = async () => {
    if (busy) return;
    busy = true;
    start.disabled = true;
    status.textContent = t('exPreparing');
    try {
      // Let the "preparing" text paint before the heavy work starts.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
      const { design, catalog } = store.getState();
      // Fonts first: if they are missing, fail before the slower 3D captures.
      const [regular, medium] = await Promise.all([fetchFont(FONT_FILES.regular), fetchFont(FONT_FILES.medium)]);
      const images = { doors: viewer.capture({ doorsVisible: true }), interior: viewer.capture({ doorsVisible: false }) };
      const spec = buildSpec(design, catalog, { lang: language.get(), unit: units.get(), now: new Date() });
      const { renderPdf } = await import('./pdfWriter.js');
      const blob = await renderPdf({ spec, design, fonts: { regular, medium }, images });
      download(blob, spec.fileName);
      status.textContent = t('exDone');
    } catch {
      status.textContent = t('exFailed');
    } finally {
      busy = false;
      start.disabled = false;
    }
  };
  const start = button('', run, { variant: 'primary', testId: 'export-download' });
  const close = button('', () => dialog.close(), { variant: 'ghost', testId: 'export-close' });
  const dialog = createDialog({
    title: '',
    labelId: 'export-dialog-title',
    testId: 'export-dialog',
    body: [intro, note, status],
    actions: [start, close],
  });
  const heading = dialog.element.querySelector('#export-dialog-title');
  const relabel = () => {
    heading.textContent = t('exTitle');
    intro.textContent = t('exIntro');
    note.textContent = t('exNote');
    start.textContent = t('exDownload');
    close.textContent = t('exCancel');
  };
  language.subscribe(relabel);
  relabel();
  // Reopening starts from a clean status line.
  return { ...dialog, open: () => { if (!busy) status.textContent = ''; dialog.open(); } };
}
