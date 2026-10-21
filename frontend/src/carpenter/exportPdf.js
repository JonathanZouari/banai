// Wires the "Carpenter PDF" button: captures the current 3D view, builds the PDF and downloads it.
// The PDF code (and jsPDF) is loaded on first click so it stays out of the initial bundle.
export function bindCarpenterPdf({ button, store, viewer }) {
  const label = button.textContent;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Preparing...';
    try {
      const { design, catalog } = store.getState();
      const { canvas } = viewer;
      const { buildCarpenterPdf } = await import('./pdf.js');
      const doc = buildCarpenterPdf({
        design,
        catalog,
        imageDataUrl: canvas.toDataURL('image/jpeg', 0.92),
        imageSize: { width: canvas.width, height: canvas.height },
      });
      doc.save('wardrobe-carpenter-brief.pdf');
    } catch {
      const banner = document.getElementById('error-banner');
      banner.textContent = 'Could not create the PDF. Please try again.';
      banner.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}
