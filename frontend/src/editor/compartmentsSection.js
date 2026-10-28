// Compartment list: widths, selection, add and remove, plus the carpenter PDF export.
import { actionResult, button, cmField, el, section } from './fields.js';
import { addCompartmentOps, removeOps } from './opsFromForm.js';
import { strings } from '../ui/i18n.js';

export function compartmentsSection({ design, selection, run, select, onExport }) {
  const t = strings();
  const list = el('ol', { className: 'compartment-list' });
  const single = design.compartments.length === 1;
  design.compartments.forEach((compartment, index) => {
    const selected = selection?.id === compartment.id;
    const row = el('li', { className: `compartment-row${selected ? ' is-selected' : ''}` });
    row.append(
      button(t.compartmentN(index + 1), () => select(compartment.id), { variant: 'link', testId: `select-${compartment.id}` }),
      cmField({
        label: t.width, mm: compartment.width, testId: `width-${compartment.id}`,
        onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: compartment.id, width: mm }]),
      }),
      button(t.remove, () => actionResult(row, run(removeOps(compartment.id))), {
        variant: 'ghost', disabled: single, testId: `remove-${compartment.id}`,
      }),
    );
    list.append(row);
  });
  const container = section(t.compartments, [list]);
  const actions = el('div', { className: onExport ? 'button-row button-row--pair' : 'button-row' }, [
    button(t.addCompartment, () => actionResult(container, run(addCompartmentOps(design))), { variant: 'secondary', testId: 'add-compartment' }),
  ]);
  if (onExport) actions.append(button(t.styleProfile, onExport, { variant: 'primary', testId: 'open-export' }));
  container.append(actions);
  return container;
}
