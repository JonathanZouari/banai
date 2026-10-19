// "My projects": save the current design under a name, open a saved one, start a new one ("ניקוי מסך":
// the top bar's "חדש" and Alt+N), and export or import a project file. Projects live in this browser
// only (share/projects.js). Leaving a design with unsaved changes asks first, inside the page.
import { button, el } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { DEFAULT_NAME, MAX_NAME, createProjectStore, fileName, projectFile, readProjectFile } from './projects.js';

const SAVE_ERRORS = Object.freeze({
  full: 'אפשר לשמור עד 30 פרויקטים בדפדפן. מחקו פרויקט ישן ונסו שוב.',
  storage: 'הדפדפן לא מאפשר לשמור כאן (אחסון חסום או מלא). אפשר לייצא את הפרויקט לקובץ.',
});
const when = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * @param store       the design store (getState, subscribe, open)
 * @param newDesign   () => a fresh default design
 * @param onOpened    (kind: 'new' | 'open') => void, after the store holds another design
 * @param toast       (text) => void
 */
export function createProjectsDialog({ store, newDesign, onOpened, toast, projects = createProjectStore() }) {
  let current = { id: null, name: DEFAULT_NAME, saved: store.getState().design };
  const dirty = () => store.getState().design !== current.saved;

  const nameInput = el('input', { className: 'field__input', attrs: { id: 'project-name', type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off' } });
  nameInput.dataset.testid = 'project-name';
  const status = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  status.dataset.testid = 'project-status';
  const list = el('ul', { className: 'project-list' });
  list.dataset.testid = 'project-list';
  const fileInput = el('input', { attrs: { type: 'file', accept: '.json,application/json', hidden: '' } });
  fileInput.dataset.testid = 'project-import-file';

  // In-page confirmation (never window.confirm): what to do with unsaved changes before leaving them.
  const confirmText = el('p', { className: 'dialog__text' });
  let pending = null;
  const confirm = createDialog({
    title: 'יש שינויים שלא נשמרו',
    labelId: 'project-confirm-title',
    testId: 'project-confirm',
    body: [confirmText],
    actions: [
      button('שמירה והמשך', () => { if (save()) proceed(); }, { variant: 'primary', testId: 'project-confirm-save' }),
      button('המשך בלי לשמור', () => proceed(), { variant: 'secondary', testId: 'project-confirm-discard' }),
      button('ביטול', () => confirm.close(), { variant: 'ghost', testId: 'project-confirm-cancel' }),
    ],
  });
  const proceed = () => {
    confirm.close();
    const run = pending;
    pending = null;
    run?.();
  };
  const guard = (text, run) => {
    if (!dirty()) return run();
    pending = run;
    confirmText.textContent = text;
    confirm.open();
    return undefined;
  };

  function save() {
    const result = projects.save({ id: current.id, name: nameInput.value || current.name, design: store.getState().design });
    if (!result.ok) {
      status.textContent = SAVE_ERRORS[result.reason];
      return false;
    }
    current = { id: result.id, name: result.name, saved: store.getState().design };
    nameInput.value = result.name;
    status.textContent = `נשמר: ${result.name}`;
    renderList();
    toast?.(`הפרויקט נשמר: ${result.name}`);
    return true;
  }

  function adopt(design, { id = null, name = DEFAULT_NAME }, kind) {
    try {
      store.open(design);
    } catch {
      status.textContent = 'הפרויקט פגום ולא נפתח. התכנון הנוכחי לא השתנה.';
      return false;
    }
    current = { id, name, saved: store.getState().design };
    nameInput.value = name === DEFAULT_NAME ? '' : name;
    status.textContent = kind === 'new' ? 'פרויקט חדש.' : `נפתח: ${name}`;
    renderList();
    onOpened?.(kind);
    return true;
  }

  const startNew = () => guard('לפני שמתחילים פרויקט חדש: לשמור את התכנון הנוכחי?', () => {
    dialog.close();
    adopt(newDesign(), {}, 'new');
  });

  function renderList() {
    const items = projects.list();
    if (!items.length) {
      list.replaceChildren(el('li', { className: 'project-list__empty', text: 'עוד אין פרויקטים שמורים בדפדפן הזה.' }));
      return;
    }
    list.replaceChildren(...items.map((item) => {
      const open = button('פתיחה', () => guard(`לפני שפותחים את "${item.name}": לשמור את התכנון הנוכחי?`, () => {
        const design = projects.get(item.id);
        if (design && adopt(design, item, 'open')) dialog.close();
      }), { variant: 'secondary', testId: `project-open-${item.id}` });
      const remove = button('מחיקה', () => {
        projects.remove(item.id);
        if (current.id === item.id) current = { ...current, id: null };
        renderList();
      }, { variant: 'ghost', testId: `project-remove-${item.id}` });
      const row = el('li', { className: `project-list__item${item.id === current.id ? ' is-current' : ''}` }, [
        el('div', { className: 'project-list__text' }, [
          el('span', { className: 'project-list__name', text: item.name }),
          el('span', { className: 'project-list__when', text: when(item.savedAt) }),
        ]),
        el('div', { className: 'project-list__actions' }, [open, remove]),
      ]);
      row.dataset.testid = 'project-item';
      return row;
    }));
  }

  const exportFile = () => {
    const name = nameInput.value || current.name;
    const blob = new Blob([projectFile({ name, design: store.getState().design })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { attrs: { href: url, download: fileName(name) } });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'הקובץ נוצר.';
  };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const read = file.size > 1024 * 1024 ? { ok: false, reason: 'size' } : readProjectFile(await file.text());
    if (!read.ok) {
      status.textContent = 'זה לא קובץ פרויקט של בנאי.';
      return;
    }
    guard(`לפני שפותחים את "${read.name}": לשמור את התכנון הנוכחי?`, () => {
      if (adopt(read.design, { name: read.name }, 'open')) dialog.close();
    });
  });

  const dialog = createDialog({
    title: 'הפרויקטים שלי',
    labelId: 'projects-dialog-title',
    testId: 'save-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'הפרויקטים נשמרים בדפדפן הזה בלבד, בלי חשבון. כדי לעבור למחשב אחר, ייצאו את הפרויקט לקובץ.' }),
      el('div', { className: 'field' }, [el('label', { className: 'field__label', text: 'שם הפרויקט', attrs: { for: 'project-name' } }), nameInput]),
      el('div', { className: 'project-row' }, [
        button('שמירה', () => save(), { variant: 'primary', testId: 'save-confirm' }),
        button('פרויקט חדש', startNew, { variant: 'secondary', testId: 'project-new' }),
      ]),
      status,
      el('h3', { className: 'project-list__title', text: 'פרויקטים שמורים' }),
      list,
      el('div', { className: 'project-row' }, [
        button('ייצוא לקובץ', exportFile, { variant: 'ghost', testId: 'project-export' }),
        button('ייבוא מקובץ', () => fileInput.click(), { variant: 'ghost', testId: 'project-import' }),
        fileInput,
      ]),
    ],
    actions: [button('סגירה', () => dialog.close(), { variant: 'ghost', testId: 'save-close' })],
  });

  return {
    open() {
      nameInput.value = current.name === DEFAULT_NAME ? '' : current.name;
      status.textContent = dirty() ? 'יש שינויים שלא נשמרו.' : '';
      renderList();
      dialog.open();
      nameInput.focus();
    },
    /** "ניקוי מסך": start over, asking first when there are unsaved changes. */
    startNew: () => guard('לפני שמתחילים מחדש: לשמור את התכנון הנוכחי?', () => adopt(newDesign(), {}, 'new')),
    save: () => (current.id ? save() : (dialog.open(), nameInput.focus())),
    get dirty() {
      return dirty();
    },
  };
}
