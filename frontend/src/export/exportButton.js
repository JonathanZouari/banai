// "Carpenter PDF" button: renders pictures of the committed design and downloads the build sheet.
// The PDF library and the picture code are loaded on first use, so the editor starts as fast as before.
export const EXPORT_ERROR = 'The PDF could not be created. Please try again.';
export const EXPORT_LABEL = 'Carpenter PDF';

export function downloadBytes(bytes, filename, doc = document) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function bindPdfExport({ button, store, onError }) {
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    button.textContent = 'Preparing…';
    try {
      const [{ captureViews }, { buildCarpenterPdf, PDF_FILENAME }] = await Promise.all([
        import('./captureViews.js'),
        import('./carpenterPdf.js'),
      ]);
      const { design, catalog } = store.getState();
      const bytes = await buildCarpenterPdf({ design, catalog, views: captureViews(design, catalog) });
      downloadBytes(bytes, PDF_FILENAME);
    } catch {
      onError(EXPORT_ERROR);
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = EXPORT_LABEL;
    }
  });
}
