// "My projects": save the current design under a name, open a saved one, start a new one ("ניקוי מסך":
// the top bar's "חדש" and Alt+N), and export or import a project file. Projects live in this browser
// only (share/projects.js). Leaving a design with unsaved changes asks first, inside the page.
import { button, el } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { sameCustomer, storedCustomer } from './customer.js';
import { DEFAULT_NAME, MAX_NAME, cleanName, createProjectStore, fileName, projectFile, readProjectFile } from './projects.js';
import { remoteApi, shareHash } from './remote.js';

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
 * @param remote      the server calls (share/remote.js): projects kept on the server and shared by a link (ADR-042)
 */
export function createProjectsDialog({ store, newDesign, onOpened, toast, projects = createProjectStore(), remote = remoteApi }) {
  // The customer's details (ADR-038) belong to the project: saved, opened and started over with it.
  let current = { id: null, name: DEFAULT_NAME, saved: store.getState().design, customer: null, savedCustomer: null, remote: null };
  const dirty = () => store.getState().design !== current.saved || !sameCustomer(current.customer, current.savedCustomer);

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
  // Deleting a saved project cannot be undone, so it asks first.
  const deleteText = el('p', { className: 'dialog__text' });
  let deleting = null;
  const deleteConfirm = createDialog({
    title: 'למחוק את הפרויקט?',
    labelId: 'project-delete-title',
    testId: 'project-delete',
    body: [deleteText],
    actions: [
      button('מחיקה', () => {
        if (deleting) {
          projects.remove(deleting.id);
          if (current.id === deleting.id) current = { ...current, id: null };
          status.textContent = `נמחק: ${deleting.name}`;
        }
        deleting = null;
        deleteConfirm.close();
        renderList();
      }, { variant: 'primary', testId: 'project-delete-confirm' }),
      button('ביטול', () => { deleting = null; deleteConfirm.close(); }, { variant: 'ghost', testId: 'project-delete-cancel' }),
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
    const result = projects.save({ id: current.id, name: nameInput.value || current.name, design: store.getState().design, customer: current.customer, remote: current.remote });
    if (!result.ok) {
      status.textContent = SAVE_ERRORS[result.reason];
      return false;
    }
    current = { ...current, id: result.id, name: result.name, saved: store.getState().design, savedCustomer: current.customer };
    nameInput.value = result.name;
    status.textContent = `נשמר: ${result.name}`;
    renderList();
    toast?.(`הפרויקט נשמר: ${result.name}`);
    return true;
  }

  function adopt(design, { id = null, name = DEFAULT_NAME, customer = null, remote: link = null }, kind) {
    try {
      store.open(design);
    } catch {
      status.textContent = 'הפרויקט פגום ולא נפתח. התכנון הנוכחי לא השתנה.';
      return false;
    }
    current = { id, name, saved: store.getState().design, customer, savedCustomer: customer, remote: link };
    // A new project is no longer the shared one: its address loses the link.
    if (kind === 'new' && globalThis.location?.hash) globalThis.history?.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
    renderShare();
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
        const saved = projects.entry(item.id);
        if (saved && adopt(saved.design, { ...item, customer: saved.customer, remote: saved.remote }, 'open')) dialog.close();
      }), { variant: 'secondary', testId: `project-open-${item.id}` });
      const remove = button('מחיקה', () => {
        deleting = item;
        deleteText.textContent = `"${item.name}" יימחק מהדפדפן הזה, ואי אפשר לשחזר אותו.`;
        deleteConfirm.open();
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
    const blob = new Blob([projectFile({ name, design: store.getState().design, customer: current.customer })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { attrs: { href: url, download: fileName(name) } });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = current.customer ? 'הקובץ נוצר. הוא כולל את פרטי הלקוח: שתפו אותו רק עם מי שצריך.' : 'הקובץ נוצר.';
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
      if (adopt(read.design, { name: read.name, customer: read.customer }, 'open')) dialog.close();
    });
  });


  // Projects on the server, shared by a link (ADR-042). The customer's details go there too, but never to Bob.
  const SHARE_ERRORS = Object.freeze({
    STALE: 'הפרויקט נשמר ממקום אחר מאז שפתחתם אותו, ולכן לא דרסנו אותו. אפשר לשמור את מה שיש לכם כפרויקט חדש בשרת.',
    NOT_FOUND: 'הפרויקט כבר לא קיים בשרת, או שהקישור לא נכון.',
    STORAGE_OFF: 'השרת הזה לא מוגדר לשמור פרויקטים.',
    STORAGE_UNAVAILABLE: 'מאגר הפרויקטים לא ענה. נסו שוב בעוד רגע.',
    STORAGE_FULL: 'השרת לא יכול לשמור עוד פרויקטים כרגע.',
    BUSY: 'השרת עסוק. נסו שוב בעוד רגע.',
    RATE_LIMITED: 'נשמרו יותר מדי פרויקטים חדשים. נסו שוב מאוחר יותר.',
    SCHEMA_INVALID: 'התכנון לא עבר את בדיקות השרת, ולכן לא נשמר.',
  });
  const shareStatus = el('p', { className: 'dialog__status', attrs: { role: 'status' } });
  shareStatus.dataset.testid = 'share-status';
  const linkInput = el('input', { className: 'field__input', attrs: { type: 'text', readonly: '', dir: 'ltr', 'aria-label': 'קישור לפרויקט', autocomplete: 'off' } });
  linkInput.dataset.testid = 'share-link';
  const copyLink = button('העתקת הקישור', async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      shareStatus.textContent = 'הקישור הועתק.';
    } catch {
      linkInput.select();
      shareStatus.textContent = 'סמנו והעתיקו את הקישור (Ctrl+C).';
    }
  }, { variant: 'ghost', testId: 'share-copy' });
  const linkRow = el('div', { className: 'project-row project-row--link' }, [linkInput, copyLink]);
  linkRow.hidden = true;
  const shareSave = button('שמירה בשרת וקבלת קישור', () => saveToServer(), { variant: 'secondary', testId: 'share-save' });
  const shareSaveNew = button('שמירה כפרויקט חדש בשרת', () => saveToServer({ asNew: true }), { variant: 'ghost', testId: 'share-save-new' });
  shareSaveNew.hidden = true;
  const shareDelete = button('מחיקה מהשרת', () => unshareConfirm.open(), { variant: 'ghost', testId: 'share-delete' });
  shareDelete.hidden = true;
  let serverOn = null; // null: not asked yet; the answer comes from /api/health
  let sharing = false;

  const unshareConfirm = createDialog({
    title: 'למחוק את הפרויקט מהשרת?',
    labelId: 'share-delete-title',
    testId: 'share-delete-dialog',
    body: [el('p', { className: 'dialog__text', text: 'הקישור יפסיק לעבוד לכל מי שיש לו אותו. הפרויקט נשאר בדפדפן הזה, ואפשר לשמור אותו בשרת שוב.' })],
    actions: [
      button('מחיקה מהשרת', async () => {
        unshareConfirm.close();
        if (!current.remote) return;
        try {
          await remote.remove(current.remote);
          current = { ...current, remote: null };
          shareStatus.textContent = 'הפרויקט נמחק מהשרת.';
        } catch (error) {
          if (error?.code === 'NOT_FOUND') current = { ...current, remote: null };
          shareStatus.textContent = SHARE_ERRORS[error?.code] ?? 'לא הצלחנו למחוק מהשרת. נסו שוב.';
        }
        renderShare();
      }, { variant: 'primary', testId: 'share-delete-confirm' }),
      button('ביטול', () => unshareConfirm.close(), { variant: 'ghost', testId: 'share-delete-cancel' }),
    ],
  });

  function renderShare() {
    const link = current.remote;
    linkRow.hidden = !link;
    shareDelete.hidden = !link;
    if (link) linkInput.value = `${globalThis.location.origin}${globalThis.location.pathname}${shareHash(link)}`;
    shareSave.textContent = link ? 'עדכון בשרת' : 'שמירה בשרת וקבלת קישור';
    shareSave.disabled = sharing || serverOn === false;
    shareSaveNew.disabled = sharing || serverOn === false;
    if (serverOn === false) shareStatus.textContent = 'השרת הזה לא מוגדר לשמור פרויקטים, אז אפשר לשמור רק בדפדפן או בקובץ.';
  }

  async function saveToServer({ asNew = false } = {}) {
    if (sharing) return;
    sharing = true;
    shareSaveNew.hidden = true;
    renderShare();
    const name = cleanName(nameInput.value || current.name);
    const { design } = store.getState();
    const { customer } = current;
    try {
      let link;
      if (current.remote && !asNew) {
        const saved = await remote.save(current.remote, { name, design, customer });
        link = { ...current.remote, revision: saved.revision };
      } else {
        const made = await remote.create({ name, design, customer });
        link = { id: made.id, token: made.token, revision: made.revision };
      }
      current = { ...current, name, remote: link, saved: design, savedCustomer: customer };
      nameInput.value = name;
      save(); // the local list keeps the same project, with its link
      shareStatus.textContent = customer
        ? 'נשמר בשרת. כל מי שיש לו את הקישור יכול לפתוח ולערוך, כולל פרטי הלקוח. שלחו אותו רק למי שצריך.'
        : 'נשמר בשרת. כל מי שיש לו את הקישור יכול לפתוח ולערוך. שלחו אותו רק למי שצריך.';
    } catch (error) {
      if (error?.code === 'NOT_FOUND') current = { ...current, remote: null };
      shareSaveNew.hidden = error?.code !== 'STALE';
      shareStatus.textContent = SHARE_ERRORS[error?.code] ?? 'לא הצלחנו לשמור בשרת. בדקו את החיבור ונסו שוב.';
    } finally {
      sharing = false;
      renderShare();
    }
  }

  /** Open a project from its link (boot, or a link pasted into the address bar). Resolves true when it opened. */
  async function openShared(link) {
    try {
      const data = await remote.open(link);
      const opened = adopt(data.design, { name: data.name, customer: storedCustomer(data.customer), remote: { ...link, revision: data.revision } }, 'open');
      if (opened) toast?.('הפרויקט נפתח מקישור. שמירה בשרת תעדכן את הפרויקט הזה, ומי שיש לו את הקישור רואה גם את פרטי הלקוח.');
      return opened;
    } catch (error) {
      status.textContent = SHARE_ERRORS[error?.code] ?? 'לא הצלחנו לפתוח את הפרויקט מהקישור.';
      return false;
    }
  }

  const listTitle = el('h3', { className: 'project-list__title', text: 'פרויקטים שמורים' });
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
      el('h3', { className: 'project-list__title', text: 'שמירה בשרת וקישור' }),
      el('p', { className: 'dialog__text', text: 'אפשר לשמור את הפרויקט בשרת ולקבל קישור: מי שיש לו את הקישור יכול לפתוח ולערוך, בלי חשבון. פרטי הלקוח נשמרים איתו בשרת, עד שתמחקו אותו משם.' }),
      el('div', { className: 'project-row' }, [shareSave, shareSaveNew, shareDelete]),
      linkRow,
      shareStatus,
      listTitle,
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
    /** Open the dialog. `list`: the "פתיחה" button, so the saved projects come first in focus and view. */
    open({ list: toList = false } = {}) {
      nameInput.value = current.name === DEFAULT_NAME ? '' : current.name;
      status.textContent = dirty() ? 'יש שינויים שלא נשמרו.' : '';
      renderList();
      renderShare();
      if (serverOn === null) remote.available().then((on) => { serverOn = on; renderShare(); });
      dialog.open();
      if (!toList) {
        nameInput.focus();
        return;
      }
      listTitle.scrollIntoView({ block: 'start' });
      (list.querySelector('button') ?? nameInput).focus();
      if (!projects.list().length) status.textContent = 'עוד אין פרויקטים שמורים. שמרו את התכנון כדי לחזור אליו.';
    },
    /** "ניקוי מסך": start over, asking first when there are unsaved changes. */
    startNew: () => guard('לפני שמתחילים מחדש: לשמור את התכנון הנוכחי?', () => adopt(newDesign(), {}, 'new')),
    openShared,
    save: () => (current.id ? save() : (dialog.open(), nameInput.focus())),
    get dirty() {
      return dirty();
    },
    /** The current project's customer details (ADR-038), or null. */
    getCustomer: () => current.customer,
    setCustomer: (customer) => { current = { ...current, customer: customer ?? null }; },
  };
}
