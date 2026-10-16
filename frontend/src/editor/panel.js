// Properties panel: re-renders from store state when the design or selection changed.
// Every edit goes through store.dispatch(ops); a rejected op leaves the state (and panel)
// as-is and shows an inline message. No LLM is involved in manual editing.
//
// Re-renders are deferred to setTimeout(0) so a Tab key's focus move finishes before the
// DOM is replaced; focus, caret and scroll position are then restored.
import { compartmentsSection } from './compartmentsSection.js';
import { componentSection } from './componentSection.js';
import { wardrobeSection } from './wardrobeSection.js';

const HINT_DEFAULT = 'Click a component in the 3D view to edit it.';
const HINT_SELECTED = 'Press Esc or click empty space to deselect.';
const TEXT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password']);

const keyOf = (node) => {
  const { testid, key } = node.dataset;
  if (testid) return `t:${testid}`;
  if (!key) return null;
  const sectionKey = node.closest('[data-section]')?.dataset.section ?? '';
  const group = node.closest('[data-group]')?.dataset.group ?? '';
  return `k:${sectionKey}/${group}/${key}`;
};

function captureFocus(root) {
  const active = document.activeElement;
  if (!active || active === root || !root.contains(active)) return null;
  const key = keyOf(active);
  if (!key) return null;
  const isText = active.tagName === 'INPUT' && TEXT_TYPES.has(active.type);
  return {
    key,
    value: isText ? active.value : null,
    start: isText ? active.selectionStart : null,
    end: isText ? active.selectionEnd : null,
  };
}

function restoreFocus(root, saved) {
  if (!saved) return;
  const target = [...root.querySelectorAll('[data-testid], [data-key]')].find((node) => keyOf(node) === saved.key);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (saved.start === null) return;
  try {
    if (target.value !== saved.value) {
      target.setSelectionRange(target.value.length, target.value.length);
    } else {
      target.setSelectionRange(saved.start, saved.end);
    }
  } catch { /* input type without a selection range */ }
}

export function mountPanel(root, store) {
  const scroller = root.closest('#properties-panel') ?? root.parentElement;
  const hint = scroller?.querySelector('.panel__hint') ?? null;
  const run = (ops) => {
    try {
      return store.dispatch(ops);
    } catch {
      return { ok: false, error: { code: 'UNEXPECTED' } }; // shown as a generic message
    }
  };
  const select = (id) => store.select(id);
  let rendered = { design: null, selection: undefined, selectionKey: null };

  const render = (state) => {
    if (state.design === rendered.design && state.selection === rendered.selection) return;
    const selectionKey = state.selection ? `${state.selection.kind}:${state.selection.id}` : null;
    const selectionChanged = selectionKey !== rendered.selectionKey;
    rendered = { design: state.design, selection: state.selection, selectionKey };

    const saved = captureFocus(root);
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const context = { design: state.design, catalog: state.catalog, selection: state.selection, run, select };
    root.replaceChildren(
      ...(state.selection ? [componentSection(context)] : []),
      ...wardrobeSection(context),
      compartmentsSection(context),
    );
    if (hint) hint.textContent = state.selection ? HINT_SELECTED : HINT_DEFAULT;
    restoreFocus(root, saved);
    if (!scroller) return;
    if (selectionChanged) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      scroller.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    } else {
      scroller.scrollTop = scrollTop;
    }
  };

  let pending = null;
  const unsubscribe = store.subscribe(() => {
    if (pending !== null) return;
    pending = setTimeout(() => {
      pending = null;
      render(store.getState());
    }, 0);
  });
  render(store.getState());
  return () => {
    unsubscribe();
    if (pending !== null) clearTimeout(pending);
  };
}
