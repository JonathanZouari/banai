// Contextual inspector: shows the wardrobe when nothing is selected, otherwise only the
// controls for the selected component. Re-renders from store state on every committed
// change. Every edit goes through store.dispatch(ops); a rejected op leaves the state
// (and panel) as-is and shows an inline message. No LLM is involved in manual editing.
import { componentSection } from './componentSection.js';
import { el } from './fields.js';
import { wardrobeSection } from './wardrobeSection.js';
import { icon } from '../ui/icons.js';
import { KIND_NOUNS, nameOf } from '../ui/naming.js';

/** Panel head: kind as the title, a clickable path ("Right section · Shelf 2") below. */
function heading(root, design, selection, select) {
  const name = selection && selection.kind !== 'carcass' ? nameOf(design, selection.id) : null;
  const path = el('p', { className: 'selection-path' });
  let title;
  if (name) {
    title = KIND_NOUNS[selection.kind];
    if (name.parent) {
      const parentId = design.compartments.find((c) => [...c.shelves, ...c.drawers, ...c.rails].some((i) => i.id === selection.id))?.id;
      const parent = el('button', { text: name.parent, attrs: { type: 'button', title: `Select ${name.parent}` } });
      parent.addEventListener('click', () => select(parentId));
      path.append(parent, ` · ${name.title}`);
    } else {
      const whole = el('button', { text: 'Wardrobe', attrs: { type: 'button', title: 'Back to the whole wardrobe' } });
      whole.addEventListener('click', () => select(null));
      path.append(whole, ` · ${name.title}`);
    }
  } else {
    title = 'Wardrobe';
    path.textContent = `Whole wardrobe · ${design.compartments.length} section${design.compartments.length === 1 ? '' : 's'}`;
  }
  const close = name ? [(() => {
    const node = el('button', { className: 'btn btn--ghost btn--icon', attrs: { type: 'button', 'aria-label': 'Clear selection', title: 'Clear selection (Esc)' } }, [icon('close', { size: 16 })]);
    node.addEventListener('click', () => select(null));
    return node;
  })()] : [];
  root.replaceChildren(el('div', { className: 'side__heading-text' }, [el('h2', { className: 'side__title', text: title }), path]), ...close);
}

export function mountPanel(root, store, { headingRoot } = {}) {
  const run = (ops) => {
    try {
      return store.dispatch(ops);
    } catch {
      return { ok: false, error: { code: 'UNEXPECTED' } }; // shown as a generic message
    }
  };
  const select = (id) => store.select(id);
  let rendered = { design: null, selection: undefined };

  const render = (state) => {
    if (state.design === rendered.design && state.selection === rendered.selection) return;
    rendered = { design: state.design, selection: state.selection };
    const context = { design: state.design, catalog: state.catalog, selection: state.selection, run, select };
    const contextual = state.selection && state.selection.kind !== 'carcass';
    if (headingRoot) heading(headingRoot, state.design, state.selection, select);
    root.replaceChildren(...(contextual ? componentSection(context) : wardrobeSection(context)));
    if (!contextual) {
      root.append(el('p', { className: 'inspector-hint', text: 'Tip: click any part of the wardrobe to edit just that part.' }));
    }
  };

  const unsubscribe = store.subscribe(render);
  render(store.getState());
  return unsubscribe;
}
