// Compartment list: widths, selection, add and remove.
import { actionResult, button, cmField, el, section } from './fields.js';
import { addCompartmentOps, removeOps } from './opsFromForm.js';
import { t, tf } from '../i18n/strings.js';

export function compartmentsSection({ design, selection, run, select }) {
  const list = el('ol', { className: 'compartment-list' });
  const single = design.compartments.length === 1;
  design.compartments.forEach((compartment, index) => {
    const selected = selection?.id === compartment.id;
    const row = el('li', { className: `compartment-row${selected ? ' is-selected' : ''}` });
    row.append(
      button(`${t('edCompartment')} ${index + 1}`, () => select(compartment.id), { variant: 'link', testId: `select-${compartment.id}` }),
      cmField({
        label: t('edWidth'), mm: compartment.width, testId: `width-${compartment.id}`,
        onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: compartment.id, width: mm }]),
      }),
      button(t('edRemove'), () => actionResult(row, run(removeOps(compartment.id))), {
        variant: 'ghost', disabled: single, testId: `remove-${compartment.id}`,
      }),
    );
    list.append(row);
  });
  const container = section(t('edCompartments'), [list]);
  container.append(button(t('edAddCompartment'), () => actionResult(container, run(addCompartmentOps(design))), { variant: 'secondary', testId: 'add-compartment' }));
  return container;
}
