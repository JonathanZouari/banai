// Interior layout picker: one click refills every compartment with a ready-made formation.
import { actionResult, el, section } from './fields.js';
import { INTERIOR_LAYOUTS, layoutOps } from './layouts.js';

export function layoutSection({ design, run }) {
  const container = section('Interior layout', [
    el('p', { className: 'panel__note', text: 'Replaces the shelves, rails and drawers in every compartment. You can fine-tune them afterwards.' }),
  ]);
  const options = el('div', { className: 'layout-options' }, INTERIOR_LAYOUTS.map((layout) => {
    const option = el('button', { className: 'layout-option', attrs: { type: 'button' } }, [
      el('span', { className: 'layout-option__label', text: layout.label }),
      el('span', { className: 'layout-option__text', text: layout.description }),
    ]);
    option.dataset.testid = `layout-${layout.id}`;
    option.addEventListener('click', () => actionResult(container, run(layoutOps(design, layout.id))));
    return option;
  }));
  container.append(options);
  return container;
}
