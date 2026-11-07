// Properties panel: re-renders from store state on every committed change. Every edit
// goes through store.dispatch(ops); a rejected op leaves the state (and panel) as-is
// and shows an inline message. No LLM is involved in manual editing.
//
// Layout (progressive disclosure): the selected component first, then five numbered steps as native
// <details> (keyboard and screen-reader friendly), each showing a live one-line summary of its
// choices, then "All parts" (always open: the keyboard path to everything the 3D view selects).
import { compartmentsSection } from './compartmentsSection.js';
import { componentSection } from './componentSection.js';
import { el } from './fields.js';
import { notesGroup } from './notesSection.js';
import { partsSection } from './partsSection.js';
import { STEPS, stepSummaries } from './steps.js';
import { dimensionsGroup, doorsGroup, materialsGroup } from './wardrobeSection.js';
import { getUiLanguage, t } from '../ui/i18n.js';

const DEFAULT_OPEN = Object.freeze(['dimensions']);

function step({ id, index, summary, body, open, onToggle }) {
  const s = t().editor;
  const value = el('span', { className: 'step__value', text: summary });
  const toggle = el('summary', { className: 'step__summary' }, [
    el('span', { className: 'step__number', text: String(index + 1), attrs: { 'aria-hidden': 'true' } }),
    el('span', { className: 'step__text' }, [
      el('span', { className: 'step__title', text: s.steps[id] }),
      value,
    ]),
  ]);
  toggle.dataset.testid = `step-${id}-toggle`;
  toggle.setAttribute('aria-label', `${s.stepNumber(index + 1)}: ${s.steps[id]}, ${summary}`);
  const details = el('details', { className: 'step', attrs: open ? { open: '' } : {} }, [toggle, el('div', { className: 'step__body' }, [body])]);
  details.dataset.testid = `step-${id}`;
  details.addEventListener('toggle', () => onToggle(id, details.open));
  return { details, toggle, value };
}

export function mountPanel(root, store, { onExport, units } = {}) {
  const run = (ops) => {
    try {
      return store.dispatch(ops);
    } catch {
      return { ok: false, error: { code: 'UNEXPECTED' } }; // shown as a generic message
    }
  };
  const select = (id) => store.select(id);
  const openSteps = new Set(DEFAULT_OPEN); // survives re-renders
  let rendered = { design: null, selection: undefined, language: null, unit: undefined };
  let views = {};

  const onToggle = (id, open) => {
    if (open) openSteps.add(id);
    else openSteps.delete(id);
  };

  const render = (state) => {
    const language = getUiLanguage();
    const unit = units?.get() ?? 'cm';
    if (state.design === rendered.design && state.selection === rendered.selection && language === rendered.language && unit === rendered.unit) return;
    rendered = { design: state.design, selection: state.selection, language, unit };
    const context = { design: state.design, catalog: state.catalog, selection: state.selection, run, select, onExport, unit };
    const summaries = stepSummaries(state.design, state.catalog, state.request.notes, unit);
    const bodies = {
      dimensions: () => dimensionsGroup(context),
      doors: () => doorsGroup(context),
      interior: () => compartmentsSection(context),
      materials: () => materialsGroup(context),
      notes: () => notesGroup({
        getNotes: () => store.getState().request.notes,
        setNotes: (text) => store.setNotes(text),
        onChange: (notes) => {
          const summary = stepSummaries(store.getState().design, store.getState().catalog, notes, unit).notes;
          views.notes.value.textContent = summary;
          views.notes.toggle.setAttribute('aria-label', `${t().editor.stepNumber(5)}: ${t().editor.steps.notes}, ${summary}`);
        },
      }),
    };
    views = Object.fromEntries(STEPS.map((id, index) => [id, step({
      id, index, summary: summaries[id], body: bodies[id](), open: openSteps.has(id), onToggle,
    })]));
    // Re-rendering replaces every control: put keyboard focus back on the same one (WCAG 2.4.3).
    const focused = root.contains(document.activeElement) ? document.activeElement.dataset.testid : undefined;
    root.replaceChildren(
      ...(state.selection ? [componentSection(context)] : []),
      ...STEPS.map((id) => views[id].details),
      partsSection(context),
    );
    if (focused) root.querySelector(`[data-testid="${CSS.escape(focused)}"]`)?.focus();
  };

  const unsubscribe = store.subscribe(render);
  const unsubscribeUnits = units?.subscribe(() => render(store.getState()));
  render(store.getState());
  return {
    unsubscribe: () => { unsubscribe(); unsubscribeUnits?.(); },
    /** Re-render with the current UI language (the store did not change). */
    refresh: () => {
      rendered = { ...rendered, language: null };
      render(store.getState());
    },
    /** Open a step (e.g. when a homepage action leads to it). */
    openStep: (id) => {
      if (!views[id]) return;
      openSteps.add(id);
      views[id].details.open = true;
    },
  };
}
