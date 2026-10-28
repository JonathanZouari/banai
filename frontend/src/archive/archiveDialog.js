// "Last designs" dialog: a list of the designs kept in this browser, a detail view for one of them
// (dates and measurements) with Open and Remove, and an empty state for every case with nothing to show.
// Everything from storage is rendered with textContent, never innerHTML.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';
import { tf } from '../i18n/strings.js';
import { formatDate, formatSize, summarize } from './summary.js';

const countText = (language, n) => (n === 1 ? language.t('arcCompartmentsOne') : tf('arcCompartmentsMany', { n }));

function doorsText(language, summary) {
  if (summary.doorType === 'none' || summary.doors === 0) return language.t('arcDoorsNone');
  return tf(summary.doorType === 'sliding' ? 'arcDoorsSliding' : 'arcDoorsHinged', { n: summary.doors });
}

/**
 * `openEntry(entry)` opens an archived design in the editor and returns { ok }. `onOpened()` runs after it
 * worked (the start screen closes itself there).
 */
export function createArchiveDialog({ archive, language, units, openEntry, onOpened }) {
  const content = el('div', { className: 'archive' });
  const closeButton = button('', () => dialog.close(), { variant: 'ghost', testId: 'archive-close' });
  const dialog = createDialog({
    title: '',
    labelId: 'archive-dialog-title',
    testId: 'archive-dialog',
    body: [content],
    actions: [closeButton],
  });
  const heading = dialog.element.querySelector('#archive-dialog-title');

  // view: the list, or one entry's detail. confirming: the id whose removal awaits a Yes. cannotOpen: ids
  // that failed validation this session.
  let view = { id: null };
  let confirming = null;
  const cannotOpen = new Set();

  const sizeNode = (design) => {
    const size = el('span', { className: 'archive__size', text: formatSize(summarize(design), units.get()) });
    size.dir = 'ltr'; // digits and × keep their order in right-to-left text
    return size;
  };

  const focusFirst = () => {
    const target = content.querySelector('[data-autofocus]') ?? content.querySelector('button');
    target?.focus();
  };

  function removeEntry(id) {
    archive.remove(id);
    confirming = null;
    view = { id: null };
    render();
  }

  function confirmBar(id) {
    const bar = el('div', { className: 'archive__confirm', attrs: { role: 'alertdialog', 'aria-label': language.t('arcConfirmRemove') } }, [
      el('p', { className: 'archive__confirm-text', text: language.t('arcConfirmRemove') }),
      button(language.t('arcConfirmYes'), () => removeEntry(id), { variant: 'primary', testId: 'archive-confirm-remove' }),
      button(language.t('arcConfirmNo'), () => { confirming = null; render(); }, { variant: 'ghost', testId: 'archive-cancel-remove' }),
    ]);
    bar.querySelector('[data-testid="archive-cancel-remove"]').dataset.autofocus = ''; // the safe choice
    return bar;
  }

  function listView(entries) {
    const rows = entries.map((entry) => {
      const summary = summarize(entry.design);
      const date = formatDate(entry.updatedAt, language.get());
      const open = el('button', { className: 'archive__row-main', attrs: { type: 'button' } }, [
        sizeNode(entry.design),
        el('span', { className: 'archive__meta', text: `${tf('arcEdited', { date })} · ${countText(language, summary.compartments)}` }),
      ]);
      open.dataset.testid = 'archive-row';
      open.addEventListener('click', () => { view = { id: entry.id }; confirming = null; render(); });
      const remove = el('button', { className: 'icon-btn', attrs: { type: 'button', 'aria-label': tf('arcRemoveAria', { date }), title: language.t('arcRemove') } }, [icon('delete')]);
      remove.dataset.testid = 'archive-row-remove';
      remove.addEventListener('click', () => { confirming = entry.id; render(); });
      const row = el('li', { className: 'archive__row' }, [open, remove]);
      return confirming === entry.id ? el('li', { className: 'archive__row archive__row--confirm' }, [confirmBar(entry.id)]) : row;
    });
    return el('ul', { className: 'archive__list' }, rows);
  }

  function detailView(entry) {
    const summary = summarize(entry.design);
    const facts = [
      ['arcSizeLabel', sizeNode(entry.design)],
      ['arcCreatedLabel', formatDate(entry.createdAt, language.get())],
      ['arcEditedLabel', formatDate(entry.updatedAt, language.get())],
      ['arcCompartmentsLabel', String(summary.compartments)],
      ['arcDoorsLabel', doorsText(language, summary)],
      ['arcShelvesLabel', String(summary.shelves)],
      ['arcDrawersLabel', String(summary.drawers)],
      ['arcRailsLabel', String(summary.rails)],
    ];
    const list = el('dl', { className: 'archive__facts' });
    facts.forEach(([key, value]) => {
      list.append(el('dt', { text: language.t(key) }), el('dd', {}, [typeof value === 'string' ? document.createTextNode(value) : value]));
    });
    const open = button(language.t('arcOpen'), () => {
      const result = openEntry(entry);
      if (result?.ok) {
        dialog.close();
        onOpened?.();
      } else {
        cannotOpen.add(entry.id);
        render();
      }
    }, { variant: 'primary', testId: 'archive-open' });
    open.dataset.autofocus = '';
    const actions = confirming === entry.id
      ? [confirmBar(entry.id)]
      : [
        open,
        button(language.t('arcRemove'), () => { confirming = entry.id; render(); }, { variant: 'secondary', testId: 'archive-remove' }),
        button(language.t('arcBack'), () => { view = { id: null }; render(); }, { variant: 'ghost', testId: 'archive-back' }),
      ];
    const nodes = [list];
    if (cannotOpen.has(entry.id)) {
      const warning = el('p', { className: 'dialog__status', text: language.t('arcCannotOpen'), attrs: { role: 'alert' } });
      warning.dataset.testid = 'archive-cannot-open';
      nodes.push(warning);
      open.disabled = true;
      delete open.dataset.autofocus;
    }
    nodes.push(el('div', { className: 'archive__actions' }, actions));
    return nodes;
  }

  function emptyView(available) {
    const box = el('div', { className: 'archive__empty', attrs: { tabindex: '-1' } }, [
      icon('history', { size: 40 }),
      el('p', { className: 'archive__empty-title', text: language.t(available ? 'arcEmpty' : 'arcUnavailable') }),
      ...(available ? [el('p', { className: 'dialog__text', text: language.t('arcEmptyHint') })] : []),
    ]);
    box.dataset.testid = available ? 'archive-empty' : 'archive-unavailable';
    box.dataset.autofocus = '';
    return box;
  }

  function render() {
    dialog.element.dir = language.dir();
    dialog.element.lang = language.get();
    closeButton.textContent = language.t('arcClose');
    heading.textContent = language.t('arcTitle');
    content.replaceChildren();
    const available = archive.isAvailable();
    const entries = available ? archive.list() : [];
    const entry = view.id ? entries.find((candidate) => candidate.id === view.id) : null;
    if (view.id && !entry) { view = { id: null }; confirming = null; } // removed (maybe in another tab)
    content.dataset.view = entry ? 'detail' : 'list';
    if (entry) {
      content.append(...detailView(entry));
    } else {
      content.append(el('p', { className: 'dialog__text', text: language.t('arcIntro') }));
      content.append(entries.length > 0 ? listView(entries) : emptyView(available));
    }
    if (dialog.element.open) focusFirst();
  }

  archive.subscribe(() => { if (dialog.element.open) render(); });
  language.subscribe(render);
  units.subscribe(render);
  dialog.element.addEventListener('close', () => { view = { id: null }; confirming = null; });
  render();

  return {
    element: dialog.element,
    open() {
      view = { id: null };
      confirming = null;
      render();
      dialog.open();
      focusFirst();
    },
  };
}
