// Finish design -> carpenter instructions PDF (scope change 2026-10-20).
// Step 1 shows the final design and warns that finishing locks it. Step 2 downloads the PDF:
// two snapshots of the 3D view (doors shown / interior) go to the backend, which builds the cut
// list and the drawing from the validated design. No order, price or account is involved.
import { downloadCarpentryPdf } from '../api/client.js';
import { button, el } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';

const MAX_SNAPSHOT_SIDE = 1200;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const cm = (mm) => `${(mm / 10).toFixed(1)} cm`;

/** Plain-language facts about the design, for the confirmation step. */
export function designSummary(design) {
  const { width, height, depth } = design.dimensions;
  const count = (kind) => design.compartments.reduce((total, c) => total + c[kind].length, 0);
  const doors = design.doors.type === 'none' ? 'No doors' : `${design.doors.items.length} ${design.doors.type} doors`;
  return [
    ['Size (W × H × D)', `${cm(width)} × ${cm(height)} × ${cm(depth)}`],
    ['Compartments', String(design.compartments.length)],
    ['Shelves / drawers / hanging rails', `${count('shelves')} / ${count('drawers')} / ${count('rails')}`],
    ['Doors', doors],
  ];
}

/** A PNG data URL of the current 3D view, scaled down to at most MAX_SNAPSHOT_SIDE. */
function snapshot(canvas) {
  const ratio = Math.min(1, MAX_SNAPSHOT_SIDE / Math.max(canvas.width, canvas.height));
  if (ratio === 1) return canvas.toDataURL('image/png');
  const copy = document.createElement('canvas');
  copy.width = Math.round(canvas.width * ratio);
  copy.height = Math.round(canvas.height * ratio);
  copy.getContext('2d').drawImage(canvas, 0, 0, copy.width, copy.height);
  return copy.toDataURL('image/png');
}

async function captureViews(store, canvas) {
  const { ui } = store.getState();
  store.select(null); // no selection highlight in the pictures
  const views = {};
  for (const [name, doorsVisible] of [['closed', true], ['open', false]]) {
    store.setDoorsVisible(doorsVisible);
    await nextFrame();
    await nextFrame();
    views[name] = snapshot(canvas);
  }
  store.setDoorsVisible(ui.doorsVisible);
  return views;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createFinishDialog({ store, canvas, getLanguage, onFinished }) {
  const body = el('div', { className: 'finish' });
  const actions = el('div', { className: 'finish__actions' });
  const dialog = createDialog({
    title: 'Finish design', labelId: 'finish-dialog-title', testId: 'finish-dialog', body: [body], actions: [actions],
  });
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });

  const languageSelect = el('select', { className: 'field__input', attrs: { id: 'pdf-language' } }, [
    el('option', { text: 'עברית', attrs: { value: 'he' } }),
    el('option', { text: 'English', attrs: { value: 'en' } }),
  ]);
  languageSelect.dataset.testid = 'pdf-language';

  async function download(downloadButton) {
    const { design, finalized } = store.getState();
    downloadButton.disabled = true;
    status.textContent = 'Preparing the PDF…';
    try {
      const images = await captureViews(store, canvas);
      const blob = await downloadCarpentryPdf({ design, revision: finalized.revision, language: languageSelect.value, images });
      saveBlob(blob, `banai-carpenter-r${finalized.revision}.pdf`);
      status.textContent = 'The PDF was downloaded.';
    } catch {
      status.textContent = 'The PDF could not be created. Please try again.';
    } finally {
      downloadButton.disabled = false;
    }
  }

  function showConfirm() {
    const rows = designSummary(store.getState().design).map(([label, value]) => el('div', { className: 'finish__row' }, [
      el('dt', { text: label }), el('dd', { text: value }),
    ]));
    body.replaceChildren(
      el('p', { className: 'dialog__text', text: 'This is your final design. When it is finished you can download carpenter instructions as a PDF.' }),
      el('dl', { className: 'finish__summary' }, rows),
      el('p', { className: 'finish__warning', text: 'Finishing locks the design: you will not be able to change it in this session.', attrs: { role: 'note' } }),
    );
    actions.replaceChildren(
      button('Cancel', () => dialog.close(), { variant: 'ghost', testId: 'finish-cancel' }),
      button('Finish design', () => {
        store.finalize();
        onFinished();
        showDownload();
      }, { variant: 'primary', testId: 'finish-confirm' }),
    );
  }

  function showDownload() {
    status.textContent = '';
    languageSelect.value = getLanguage();
    const downloadButton = button('Download carpenter PDF', () => download(downloadButton), { variant: 'primary', testId: 'download-pdf' });
    body.replaceChildren(
      el('p', { className: 'dialog__text', text: 'Your design is finished and locked. The PDF contains the cut list, hardware, a front drawing with all dimensions, assembly steps and pictures of the design.' }),
      el('div', { className: 'field' }, [el('label', { className: 'field__label', text: 'PDF language', attrs: { for: 'pdf-language' } }), languageSelect]),
      el('p', { className: 'dialog__note', text: 'The instructions follow documented assumptions. The carpenter must verify every measurement and the construction before cutting.' }),
      status,
    );
    actions.replaceChildren(
      button('Close', () => dialog.close(), { variant: 'ghost', testId: 'finish-close' }),
      downloadButton,
    );
  }

  return {
    element: dialog.element,
    open() {
      if (store.getState().finalized) showDownload();
      else showConfirm();
      dialog.open();
    },
  };
}
