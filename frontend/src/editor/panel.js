// Properties panel: re-renders from store state when the design or selection changed.
// Every edit goes through store.dispatch(ops); a rejected op leaves the state (and panel)
// as-is and shows an inline message. No LLM is involved in manual editing.
//
// Re-renders are deferred to setTimeout(0) so a Tab key's focus move finishes before the
// DOM is replaced; focus, caret and scroll position are then restored.
//
// A slider that is being dragged must never be replaced (removing it from the DOM ends the
// drag), so while a pointer holds a slider the render is held back: the values of every other
// input are patched in place, and the real render runs once the pointer is released.
import { compartmentsSection } from './compartmentsSection.js';
import { componentSection } from './componentSection.js';
import { coalesceKey } from './interiorOps.js';
import { createDragGate } from './liveSlider.js';
import { siteSection } from './siteSection.js';
import { roomSection } from './roomSection.js';
import { householdSection } from './householdSection.js';
import { wardrobeSection } from './wardrobeSection.js';

const HINT_DEFAULT = 'לחצו על רכיב בתלת-ממד כדי לערוך אותו.';
const HINT_SELECTED = 'Esc או לחיצה על שטח ריק מבטלים את הבחירה.';
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

const isSlider = (node) => node instanceof HTMLInputElement && node.type === 'range';

/**
 * While a slider is dragged: copy the values of the freshly built `nodes` onto the live inputs
 * with the same test id, leaving the dragged slider (and the text field beside it) alone. Only
 * values change, never the structure, so nothing the user is holding is replaced.
 */
function patchInputValues(root, nodes, dragged) {
  const skip = new Set(dragged.flatMap((slider) => {
    const testId = slider.dataset.testid;
    return testId ? [testId, testId.replace(/-slider$/, '')] : [];
  }));
  const live = new Map([...root.querySelectorAll('input[data-testid]')].map((node) => [node.dataset.testid, node]));
  nodes.forEach((node) => node.querySelectorAll('input[data-testid]').forEach((fresh) => {
    const target = live.get(fresh.dataset.testid);
    if (!target || skip.has(fresh.dataset.testid) || target === document.activeElement) return;
    if (isSlider(fresh)) {
      ['min', 'max', 'step', 'aria-valuetext'].forEach((name) => {
        if (target.getAttribute(name) !== fresh.getAttribute(name)) target.setAttribute(name, fresh.getAttribute(name));
      });
      target.style.setProperty('--slider-frac', fresh.style.getPropertyValue('--slider-frac'));
    }
    if (target.value !== fresh.value) target.value = fresh.value;
  }));
}

export function mountPanel(root, store) {
  const scroller = root.closest('#properties-panel') ?? root.parentElement;
  const hint = scroller?.querySelector('.panel__hint') ?? null;
  const run = (ops) => {
    try {
      return store.dispatch(ops, { coalesce: coalesceKey(ops) }); // a slider drag is one undo step
    } catch {
      return { ok: false, error: { code: 'UNEXPECTED' } }; // shown as a generic message
    }
  };
  const select = (id) => store.select(id);
  let rendered = { design: null, selection: undefined, selectionKey: null };

  const buildTree = (state) => {
    // The panel morphs fresh DOM into the existing fields, so their handlers outlive this render: a handler
    // that needs the design at commit time reads current(), not the `design` it was built with.
    const context = { design: state.design, catalog: state.catalog, selection: state.selection, run, select, current: () => store.getState().design };
    const [wardrobe, materials] = wardrobeSection(context);
    return [
      ...(state.selection ? [componentSection(context)] : []),
      siteSection(context),
      roomSection(context),
      wardrobe,
      compartmentsSection(context),
      materials,
      householdSection(context),
    ];
  };

  const gate = createDragGate();

  const render = (state) => {
    if (state.design === rendered.design && state.selection === rendered.selection) return;
    if (gate.active) {
      gate.defer(); // `rendered` stays stale on purpose: the render after the drag is a full one
      patchInputValues(root, buildTree(state), gate.tags);
      return;
    }
    const selectionKey = state.selection ? `${state.selection.kind}:${state.selection.id}` : null;
    const selectionChanged = selectionKey !== rendered.selectionKey;
    rendered = { design: state.design, selection: state.selection, selectionKey };

    const saved = captureFocus(root);
    const scrollTop = scroller ? scroller.scrollTop : 0;
    root.replaceChildren(...buildTree(state));
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
  const scheduleRender = () => {
    if (pending !== null) return;
    pending = setTimeout(() => {
      pending = null;
      render(store.getState());
    }, 0);
  };
  const unsubscribe = store.subscribe(scheduleRender);

  // Slider drags: hold the render while a pointer is down on a slider, run it after the release.
  // It goes through the same setTimeout(0), so the slider's own `change` handler runs first.
  const onPointerDown = (event) => {
    if (event.button === 0 && isSlider(event.target)) gate.begin(event.pointerId, event.target);
  };
  const onPointerEnd = (event) => {
    if (gate.end(event.pointerId)) scheduleRender();
  };
  // Safety nets for a lost pointerup: a mouse move without a button, or the window losing focus.
  const onPointerMove = (event) => {
    if (gate.active && event.pointerType === 'mouse' && event.buttons === 0 && gate.endAll()) scheduleRender();
  };
  const onBlur = () => {
    if (gate.endAll()) scheduleRender();
  };
  root.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerEnd, true);
  window.addEventListener('pointercancel', onPointerEnd, true);
  window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  window.addEventListener('blur', onBlur);

  render(store.getState());
  return () => {
    unsubscribe();
    if (pending !== null) clearTimeout(pending);
    root.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerEnd, true);
    window.removeEventListener('pointercancel', onPointerEnd, true);
    window.removeEventListener('pointermove', onPointerMove, { capture: true });
    window.removeEventListener('blur', onBlur);
  };
}
