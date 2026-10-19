// "Carpenter PDF" export: committed design -> plan -> A4 pages -> PDF download.
// Read-only: it reads the store and a snapshot of the 3D view, and never changes state.
// Everything runs in the browser; nothing is sent to a server.
import { buildCarpenterPlan } from './carpenterPlan.js';
import { renderPages } from './pageRenderer.js';
import { writePdf } from './pdfWriter.js';

export const PDF_FILENAME = 'banai-carpenter-instructions.pdf';

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('page could not be encoded'));
        return;
      }
      resolve({ jpegBytes: new Uint8Array(await blob.arrayBuffer()), widthPx: canvas.width, heightPx: canvas.height });
    }, 'image/jpeg', 0.9);
  });
}

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Build the PDF for the committed design and download it. Resolves with the PDF bytes. */
export async function exportCarpenterPdf({ store, viewer, language }) {
  const { design, catalog } = store.getState();
  const plan = buildCarpenterPlan(design, catalog, language);
  const snapshot = viewer?.snapshot?.() ?? null;
  const canvases = await renderPages(plan, { snapshot });
  const pages = await Promise.all(canvases.map(canvasToJpeg));
  const bytes = writePdf(pages);
  download(bytes, PDF_FILENAME);
  return bytes;
}
