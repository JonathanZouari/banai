// Compartment list: widths, selection, add and remove, plus the carpenter PDF export.
import { actionResult, button, cmField, el } from './fields.js';
import { addCompartmentOps, removeOps } from './opsFromForm.js';
import { t } from '../ui/i18n.js';

export function compartmentsSection({ design, selection, run, select, onExport }) {
  const list = el('ol', { className: 'compartment-list' });
  const single = design.compartments.length === 1;
  const s = t().editor;
  design.compartments.forEach((compartment, index) => {
    const selected = selection?.id === compartment.id;
    const row = el('li', { className: `compartment-row${selected ? ' is-selected' : ''}` });
    row.append(
      button(s.compartmentN(index + 1), () => select(compartment.id), { variant: 'link', testId: `select-${compartment.id}` }),
      cmField({
        label: s.width, mm: compartment.width, testId: `width-${compartment.id}`,
        onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: compartment.id, width: mm }]),
      }),
      button(s.removeCompartment, () => actionResult(row, run(removeOps(compartment.id))), {
        variant: 'ghost', disabled: single, testId: `remove-${compartment.id}`,
      }),
    );
    list.append(row);
  });
  const container = el('div', { className: 'prop-group', attrs: { role: 'group', 'aria-label': s.compartments } }, [list]);
  const actions = el('div', { className: onExport ? 'button-row button-row--pair' : 'button-row' }, [
    button(s.addCompartment, () => actionResult(container, run(addCompartmentOps(design))), { variant: 'secondary', testId: 'add-compartment' }),
  ]);
  if (onExport) actions.append(button(s.generateProfile, onExport, { variant: 'primary', testId: 'open-export' }));
  container.append(actions);
  return container;
}
