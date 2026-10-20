// Properties panel: re-renders from store state on every committed change. Every edit
// goes through store.dispatch(ops); a rejected op leaves the state (and panel) as-is
// and shows an inline message. No LLM is involved in manual editing.
import { compartmentsSection } from './compartmentsSection.js';
import { componentSection } from './componentSection.js';
import { interiorSection } from './interiorSection.js';
import { wardrobeSection } from './wardrobeSection.js';
import { units } from '../ui/units.js';
import { language } from '../i18n/strings.js';

export function mountPanel(root, store) {
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
    root.replaceChildren(
      ...(state.selection ? [componentSection(context)] : []),
      ...wardrobeSection(context),
      compartmentsSection(context),
      interiorSection(context),
    );
  };

  const unsubscribe = store.subscribe(render);
  // A different unit changes every field's text and suffix, so draw the panel again.
  const redraw = () => {
    rendered = { design: null, selection: undefined };
    render(store.getState());
  };
  const unsubscribeUnits = units.subscribe(redraw);
  const unsubscribeLanguage = language.subscribe(redraw); // every label, option and error is text in the selected language
  render(store.getState());
  return () => { unsubscribe(); unsubscribeUnits(); unsubscribeLanguage(); };
}
