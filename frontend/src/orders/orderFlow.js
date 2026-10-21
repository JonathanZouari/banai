// "Confirm order": a lightweight confirmation step (NO payment, price, account or backend order
// record). Confirming locks the design; only then can the customer download the carpenter PDF.
// "Edit again" unlocks it, which hides the PDF button until the design is confirmed again.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';
import { appearanceLabel, DISCLAIMER } from '../pdf/buildPlan.js';

const LOCKED_PANELS = ['chat-panel', 'properties-panel'];

export function summaryLines(design, catalog) {
  const { width, height, depth } = design.dimensions;
  const doors = design.doors.type === 'none' ? 'no doors' : `${design.doors.items.length} ${design.doors.type} door(s)`;
  return [
    `Size: ${width} x ${height} x ${depth} mm (width x height x depth)`,
    `${design.compartments.length} compartment(s), ${doors}`,
    `Carcass: ${appearanceLabel(design.carcass.appearance, catalog)}`,
  ];
}

export function createOrderFlow({ store, viewer, downloadPdf }) {
  const summary = el('ul', { className: 'order__summary' });
  summary.dataset.testid = 'order-summary';
  const preview = el('img', { className: 'order__preview', attrs: { alt: 'Current 3D view of your wardrobe' } });
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'order-status';
  const note = el('p', { className: 'dialog__note', text: `After you confirm, the design is locked. You can unlock it with "Edit again". ${DISCLAIMER}` });

  const banner = document.getElementById('order-banner');
  const bannerMessage = el('span', { text: 'Order confirmed. The design is locked.' });
  const bannerText = el('span', { className: 'order-banner__text' }, [icon('check', { size: 18 }), bannerMessage]);
  const pdfButton = button('Download carpenter PDF', () => runDownload(), { variant: 'primary', testId: 'download-pdf' });
  const openLink = el('a', { className: 'btn btn--tonal', text: 'Open PDF', attrs: { target: '_blank', rel: 'noopener', hidden: '' } });
  openLink.dataset.testid = 'open-pdf';
  const editAgain = button('Edit again', () => store.unlockOrder(), { variant: 'ghost', testId: 'order-edit-again' });
  banner.append(bannerText, el('div', { className: 'order-banner__actions' }, [pdfButton, openLink, editAgain]));

  let openUrl = null;
  async function runDownload() {
    pdfButton.disabled = true;
    banner.dataset.status = 'working';
    // Open the tab inside the click (before any await) so the browser does not treat it as a blocked popup.
    const tab = window.open('', '_blank');
    if (tab) tab.document.body.textContent = 'Creating your PDF…';
    try {
      const { design, catalog } = store.getState();
      const saved = await downloadPdf({ design, catalog, imageDataUrl: viewer.captureImage() });
      if (openUrl) URL.revokeObjectURL(openUrl);
      openUrl = saved.url;
      openLink.href = saved.url;
      openLink.hidden = false;
      if (tab) tab.location.href = saved.url;
      bannerMessage.textContent = tab
        ? `${saved.name} is open in a new tab and saved to your Downloads folder.`
        : `${saved.name} was created. Your browser blocked the new tab, so use Open PDF.`;
    } catch {
      tab?.close();
      bannerMessage.textContent = 'The PDF could not be created. Please try again.';
    } finally {
      pdfButton.disabled = false;
      delete banner.dataset.status;
    }
  }

  const confirmButton = button('Confirm and lock', () => {
    store.confirmOrder();
    dialog.close();
  }, { variant: 'primary', testId: 'order-confirm' });
  const dialog = createDialog({
    title: 'Confirm your order',
    labelId: 'order-dialog-title',
    testId: 'order-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'Check your design. When you confirm it, you can download a PDF with building instructions for your carpenter.' }),
      preview,
      summary,
      note,
      status,
    ],
    actions: [confirmButton, button('Back', () => dialog.close(), { variant: 'ghost', testId: 'order-back' })],
  });

  const applyLock = (confirmed) => {
    banner.hidden = !confirmed;
    LOCKED_PANELS.forEach((id) => document.getElementById(id)?.toggleAttribute('inert', confirmed));
    document.body.classList.toggle('order-locked', confirmed);
    document.getElementById('open-order').hidden = confirmed;
    if (confirmed) bannerMessage.textContent = 'Order confirmed. The design is locked.';
    if (!confirmed) openLink.hidden = true;
  };
  let wasConfirmed = false;
  store.subscribe((state) => {
    if (state.order.confirmed !== wasConfirmed) {
      wasConfirmed = state.order.confirmed;
      applyLock(wasConfirmed);
    }
  });
  applyLock(false);

  return {
    open() {
      const { design, catalog, order } = store.getState();
      if (order.confirmed) return;
      summary.replaceChildren(...summaryLines(design, catalog).map((line) => el('li', { text: line })));
      preview.src = viewer.captureImage();
      status.textContent = '';
      dialog.open();
    },
  };
}
