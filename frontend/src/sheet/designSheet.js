// "Design sheet (PDF)": an illustrative A4 summary of the current design for a carpenter to verify
// — 3D illustration, a to-scale front view with dimensions, the components and the finishes.
// It is NOT a manufacturing drawing (no cut list, no build steps; see CLAUDE.md scope) and says so.
//
// The sheet is laid out as HTML in the chat language (Hebrew RTL or English) and rendered to an
// image with html2canvas, so any script prints correctly without embedding fonts; jsPDF packs the
// image into A4 pages. Both libraries load on demand, only when the button is used.
import { el } from '../editor/fields.js';
import { elevationSvg } from './elevation.js';
import { sheetFileName, sheetModel } from './sheetModel.js';

const PAGE_WIDTH_PX = 794; // A4 at 96 dpi
const A4_RATIO = 297 / 210;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** A PNG of the 3D view with doors closed and no selection, restoring the user's view afterwards. */
async function captureIllustration({ store, viewer }) {
  const { ui, selection } = store.getState();
  if (selection) store.select(null);
  if (!ui.doorsVisible) store.setDoorsVisible(true);
  await nextFrame();
  await nextFrame();
  const image = viewer.canvas.toDataURL('image/png');
  if (!ui.doorsVisible) store.setDoorsVisible(false);
  if (selection) store.select(selection.id);
  return image;
}

const finishText = (ref, s) => (ref.custom ? s.custom(ref.name) : ref.name);

/** `numeric` lists column indexes whose numbers must read left to right (also in Hebrew). */
function table(headers, rows, { numeric = [] } = {}) {
  const cell = (text, index) => el('td', {}, [numeric.includes(index) ? el('span', { text, attrs: { dir: 'ltr' } }) : document.createTextNode(text)]);
  return el('table', { className: 'sheet__table' }, [
    el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
    el('tbody', {}, rows.map((row) => el('tr', {}, row.map(cell)))),
  ]);
}

/** The sheet as a DOM element (exported for tests and previews). `s` = the language's sheet strings. */
export function buildSheetElement({ model, design, s, dir, illustration, date = new Date() }) {
  const dateText = date.toISOString().slice(0, 10);
  const { overall } = model;
  const compartmentRows = model.compartments.map((c) => [
    s.compartment(c.n),
    c.width,
    c.shelves.length ? c.shelves.join(', ') : s.none,
    c.drawers.length ? c.drawers.map((d) => `${d.y} · ${d.height}`).join(', ') : s.none,
    c.rails.length ? c.rails.join(', ') : s.none,
  ]);
  const doorsLine = model.doors.type === 'none'
    ? s.doorType.none
    : `${s.doorType[model.doors.type]} · ${s.doorCount(model.doors.count)}${model.doors.type === 'hinged' ? ` (${model.doors.hingeSides.map((side) => s.hinge[side]).join(', ')})` : ''}`;
  const finishRows = [[s.carcass, model.finishes.carcass]];
  if (model.finishes.doors) finishRows.push([s.doorsFinish, model.finishes.doors]);

  const sheet = el('div', { className: 'sheet', attrs: { dir } }, [
    el('header', { className: 'sheet__header' }, [
      el('div', {}, [el('h1', { className: 'sheet__title', text: s.title }), el('p', { className: 'sheet__subtitle', text: s.subtitle })]),
      el('dl', { className: 'sheet__meta' }, [
        el('dt', { text: s.date }), el('dd', { text: dateText }),
        el('dt', { text: s.revision }), el('dd', { text: String(model.revision) }),
      ]),
    ]),
    el('section', { className: 'sheet__overall' }, [
      el('h2', { text: s.overall }),
      el('p', { className: 'sheet__big', text: `${overall.width} × ${overall.height} × ${overall.depth}`, attrs: { dir: 'ltr' } }),
      el('p', { className: 'sheet__small', text: `${s.width} × ${s.height} × ${s.depth} · ${s.units} · ${s.panel}: ${overall.panel}` }),
    ]),
    el('div', { className: 'sheet__figures' }, [
      el('figure', {}, [el('img', { attrs: { src: illustration, alt: s.view3d } }), el('figcaption', { text: s.view3d })]),
      el('figure', {}, [elevationSvg(design, { widthPx: 340, heightPx: 330 }), el('figcaption', { text: s.elevation })]),
    ]),
    el('section', {}, [
      el('h2', { text: s.compartments }),
      table([s.compartments, `${s.width} (cm)`, s.shelves, s.drawers, s.rails], compartmentRows, { numeric: [1, 2, 3, 4] }),
      el('p', { className: 'sheet__small', text: model.partitions.count ? s.partitionThickness(model.partitions.count, model.partitions.thickness) : '' }),
    ]),
    el('section', {}, [
      el('h2', { text: s.doors }),
      el('p', { text: doorsLine }),
    ]),
    el('section', {}, [
      el('h2', { text: s.materials }),
      table(['', s.material, s.colour, s.finish], finishRows.map(([label, f]) => [label, finishText(f.material, s), finishText(f.colour, s), finishText(f.finish, s)])),
    ]),
    el('p', { className: 'sheet__disclaimer', text: s.disclaimer }),
  ]);
  sheet.dataset.testid = 'design-sheet';
  return sheet;
}

export const SHEET_CSS = `
.sheet { box-sizing: border-box; width: ${PAGE_WIDTH_PX}px; padding: 36px 40px; background: #fff; color: #2b211d;
  font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; }
.sheet h1, .sheet h2, .sheet p, .sheet dl, .sheet figure { margin: 0; }
.sheet__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #8b5037; }
.sheet__title { font-size: 24px; font-weight: 700; }
.sheet__subtitle { color: #8b5037; font-weight: 600; }
.sheet__meta { display: grid; grid-template-columns: auto auto; gap: 2px 10px; font-size: 12px; color: #5d4f49; }
.sheet__meta dd { margin: 0; font-variant-numeric: tabular-nums; }
.sheet section { margin-top: 16px; }
.sheet h2 { font-size: 14px; font-weight: 700; color: #8b5037; margin-bottom: 6px; }
.sheet__big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sheet__small { color: #5d4f49; font-size: 11.5px; margin-top: 4px; }
.sheet__figures { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
.sheet figure { border: 1px solid #e3d6cc; border-radius: 8px; padding: 8px; background: #fbf7f4; }
.sheet figure img { display: block; width: 100%; height: 330px; object-fit: contain; }
.sheet figure svg { display: block; width: 100%; height: auto; }
.sheet figcaption { margin-top: 6px; color: #5d4f49; font-size: 11px; text-align: center; }
.sheet__table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.sheet__table th, .sheet__table td { border: 1px solid #e3d6cc; padding: 5px 7px; text-align: start; vertical-align: top; }
.sheet__table th { background: #f6eee8; font-weight: 700; }
.sheet__disclaimer { margin-top: 18px; padding: 10px 12px; border-radius: 8px; background: #fff3d6; color: #4a3800; font-size: 11.5px; font-weight: 600; }
`;

/** Build the sheet off-screen and render it to a canvas (what goes into the PDF). */
export async function renderSheetCanvas({ store, viewer, language, date = new Date(), scale = 2 }) {
  const { default: html2canvas } = await import('html2canvas');
  const strings = language.strings();
  const { design, catalog, revision } = store.getState();
  const illustration = await captureIllustration({ store, viewer });
  const model = sheetModel({ design, catalog, revision });
  const sheet = buildSheetElement({ model, design, s: strings.sheet, dir: strings.dir, illustration, date });

  const host = el('div', { attrs: { 'aria-hidden': 'true' } }, [el('style', { text: SHEET_CSS }), sheet]);
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', zIndex: '-1' });
  document.body.append(host);
  try {
    await Promise.all([...sheet.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    return await html2canvas(sheet, { scale, backgroundColor: '#ffffff', logging: false });
  } finally {
    host.remove();
  }
}

/** Render the sheet, pack it into A4 PDF page(s) and download it. */
export async function exportDesignSheet({ store, viewer, language, date = new Date() }) {
  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), renderSheetCanvas({ store, viewer, language, date })]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageHeightPx = Math.round(canvas.width * A4_RATIO);
  for (let top = 0, page = 0; top < canvas.height; top += pageHeightPx, page += 1) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(pageHeightPx, canvas.height - top);
    slice.getContext('2d').drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, (slice.height / canvas.width) * 210);
  }
  pdf.save(sheetFileName(date));
}
