// Compartment list: widths, selection, add and remove.
import { actionResult, button, cmFieldParts, collapsibleSection, el } from './fields.js';
import { addCompartmentOps, removeOps } from './opsFromForm.js';
import { describeSelection } from './selectionContext.js';
import { compartmentWidthRange } from './sliderRanges.js';

export function compartmentsSection({ design, selection, run, select }) {
  const list = el('ol', { className: 'compartment-list' });
  const single = design.compartments.length === 1;
  // The compartment the selected part belongs to (or the selected compartment itself) is marked
  // aria-current and gets a quieter version of the selected-row styling.
  const { compartmentId: contextId } = describeSelection(design, selection);
  design.compartments.forEach((compartment, index) => {
    const selected = selection?.id === compartment.id;
    const inContext = contextId === compartment.id;
    const row = el('li', { className: `compartment-row${selected ? ' is-selected' : ''}${inContext ? ' compartment-row--context' : ''}` });
    if (inContext) row.setAttribute('aria-current', 'true');
    // The slider is the row's last child: it spans the full width on a line of its own (CSS).
    const { field, slider } = cmFieldParts({
      label: 'Width', mm: compartment.width, testId: `width-${compartment.id}`, range: compartmentWidthRange(design, compartment.id),
      onCommit: (mm) => run([{ op: 'modify_compartment', compartmentId: compartment.id, width: mm }]),
    });
    row.append(
      button(`Compartment ${index + 1}`, () => select(compartment.id), { variant: 'link', testId: `select-${compartment.id}` }),
      field,
      button('Remove', () => actionResult(row, run(removeOps(compartment.id))), {
        variant: 'danger-quiet', disabled: single, testId: `remove-${compartment.id}`,
      }),
      ...(slider ? [slider] : []),
    );
    list.append(row);
  });
  const container = collapsibleSection('compartments', 'Compartments', [list]);
  container.append(button('+ Add compartment', () => actionResult(container, run(addCompartmentOps(design))), { variant: 'secondary', testId: 'add-compartment' }));
  return container;
}
