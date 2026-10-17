// "Finish order": the customer reviews a summary and the common-practice findings, confirms, and
// can then download the cabinetmaker sheet (PDF). This is a local step only: nothing is stored,
// sent or charged. A later edit to the design (new revision) withdraws the sheet button, so the
// PDF always matches a design the customer confirmed.
import { button, el } from '../editor/fields.js';
import { checkDesign } from '../maker/checks.js';
import { describeAppearance } from '../maker/cutList.js';
import { buildSheet } from '../maker/sheet.js';
import { createDialog } from '../ui/dialog.js';

const cm = (mm) => (mm / 10).toFixed(1);
const LEVEL = Object.freeze({ warn: '⚠', info: 'ℹ', ok: '✓' });

const pad = (n) => String(n).padStart(2, '0');
const stamp = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

export function createFinishFlow({ store, viewer, topbarButton, exportPdf = (...args) => import('../maker/exportPdf.js').then((m) => m.exportPdf(...args)) }) {
  let confirmedRevision = null;
  let busy = false;

  const content = el('div', { className: 'finish' });
  const dialog = createDialog({
    title: 'סיום הזמנה',
    labelId: 'finish-dialog-title',
    testId: 'finish-dialog',
    body: [content],
    actions: [button('סגירה', () => dialog.close(), { variant: 'ghost', testId: 'finish-close' })],
  });
  dialog.element.setAttribute('dir', 'rtl');
  dialog.element.setAttribute('lang', 'he');

  const confirmed = () => confirmedRevision !== null && confirmedRevision === store.getState().revision;

  async function downloadSheet(trigger) {
    if (busy || !confirmed()) return;
    busy = true;
    const label = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = 'מכין PDF…';
    try {
      const { design, catalog, revision } = store.getState();
      const date = new Date();
      const pages = buildSheet({ design, catalog, snapshot: viewer.snapshot(), reference: `BANAI-${stamp(date)}-${revision}`, date });
      await exportPdf(pages, `banai-cabinetmaker-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`);
    } finally {
      busy = false;
      trigger.disabled = false;
      trigger.textContent = label;
    }
  }

  const sheetButton = (testId) => {
    const node = button('הוראות לנגר (PDF)', () => downloadSheet(node), { variant: 'primary', testId });
    return node;
  };

  function renderReview() {
    const { design, catalog } = store.getState();
    const { width, height, depth } = design.dimensions;
    const findings = checkDesign(design).filter((f) => f.level !== 'ok');
    const agree = el('input', { attrs: { type: 'checkbox', id: 'finish-agree' } });
    agree.dataset.testid = 'finish-agree';
    const confirm = button('אישור וסיום', () => {
      confirmedRevision = store.getState().revision;
      render();
    }, { variant: 'primary', testId: 'finish-confirm', disabled: true });
    agree.addEventListener('change', () => { confirm.disabled = !agree.checked; });

    content.replaceChildren(
      el('ul', { className: 'finish__summary' }, [
        `מידות: ${cm(width)} × ${cm(height)} × ${cm(depth)} ס"מ (רוחב × גובה × עומק)`,
        `גוף: ${describeAppearance(design.carcass.appearance, catalog)}`,
        `דלתות: ${design.doors.type === 'none' ? 'ללא' : `${design.doors.items.length} – ${describeAppearance(design.doors.appearance, catalog)}`}`,
        `${design.compartments.length} תאים`,
      ].map((text) => el('li', { text }))),
      ...(findings.length ? [
        el('h3', { className: 'finish__heading', text: 'כדאי לבדוק לפני הייצור' }),
        el('ul', { className: 'finish__findings' }, findings.map((f) => el('li', { className: `finish__finding finish__finding--${f.level}`, text: `${LEVEL[f.level]} ${f.text}` }))),
      ] : []),
      el('p', { className: 'dialog__note', text: 'ההזמנה נשמרת רק במכשיר הזה; שום דבר לא נשלח ולא מחויב. הוראות הנגר הן הנחיה לפי כללי אצבע מקובלים ואינן אישור ייצור.' }),
      el('label', { className: 'finish__agree' }, [agree, el('span', { text: 'קראתי ואני מאשר/ת את העיצוב' })]),
      el('div', { className: 'button-row' }, [confirm]),
    );
  }

  function renderDone() {
    content.replaceChildren(
      el('p', { className: 'finish__done', text: '✓ ההזמנה הושלמה. אפשר להוריד את ההוראות לנגר.' }),
      el('div', { className: 'button-row' }, [sheetButton('finish-sheet')]),
    );
  }

  function render() {
    if (confirmed()) renderDone();
    else renderReview();
    topbarButton.hidden = !confirmed();
  }

  topbarButton.addEventListener('click', () => downloadSheet(topbarButton));
  // An edit after finishing withdraws the sheet until the customer confirms again.
  store.subscribe(() => { topbarButton.hidden = !confirmed(); });
  topbarButton.hidden = true;

  return {
    open() {
      render();
      dialog.open();
    },
  };
}
