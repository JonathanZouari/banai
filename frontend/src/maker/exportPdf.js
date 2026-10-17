// Turns the sheet pages into a PDF. jsPDF cannot lay out right-to-left Hebrew mixed with numbers
// reliably, so each A4 page is rendered by the browser, rasterized with html2canvas, and placed
// as an image. Both libraries load only when the cabinetmaker asks for the PDF.
import '../styles/sheet.css';

const A4 = { widthMm: 210, heightMm: 297 };

/** Render `pages` (from buildSheet) into a PDF and download it as `filename`. */
export async function exportPdf(pages, filename) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);
  // Off-screen but laid out (not display:none), so the browser measures and paints it.
  const host = document.createElement('div');
  host.className = 'maker-sheet';
  host.setAttribute('aria-hidden', 'true');
  host.append(...pages);
  document.body.append(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    for (const [index, pageElement] of pages.entries()) {
      const canvas = await html2canvas(pageElement, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: false });
      // A page that grew past A4 (a long cut list) is scaled down to fit, never cut off.
      const ratio = canvas.height / canvas.width;
      const width = Math.min(A4.widthMm, A4.heightMm / ratio);
      const height = width * ratio;
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (A4.widthMm - width) / 2, 0, width, height);
    }
    pdf.setProperties({ title: 'BanAI – הוראות לנגר', creator: 'BanAI Wardrobe Designer' });
    pdf.save(filename);
  } finally {
    host.remove();
  }
}
