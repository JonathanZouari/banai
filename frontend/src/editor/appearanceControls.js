// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Each target is its own labelled card, so the parts of the wardrobe stay visibly and
// audibly distinct. Catalog values and customer-defined custom colours stay distinct too.
import { button, el, nextId, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;
const refName = (ref, entries) => (ref.custom ? ref.name : entries.find((entry) => entry.id === ref.catalogId)?.name ?? ref.catalogId);
const colourHex = (ref, catalog) => (ref.custom ? ref.hex : catalog.colors.find((c) => c.id === ref.catalogId)?.hex);

function summary({ catalog, appearance }) {
  const dot = el('span', { className: 'appearance__dot', attrs: { 'aria-hidden': 'true' } });
  const hex = colourHex(appearance.color, catalog);
  if (hex) dot.style.backgroundColor = hex; // validated #rrggbb from the parsed catalog or design
  const text = [
    refName(appearance.material, catalog.materials),
    refName(appearance.color, catalog.colors),
    refName(appearance.finish, catalog.finishes),
  ].join(' · ');
  return el('p', { className: 'appearance__summary' }, [dot, el('span', { text })]);
}

function swatches({ catalog, appearance, run, target, label }) {
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': `${label} colour` } });
  catalog.colors.forEach((color) => {
    const swatch = el('button', {
      className: 'swatch',
      attrs: { type: 'button', title: color.name, 'aria-label': color.name, 'aria-pressed': String(isCatalog(appearance.color, color.id)) },
    });
    swatch.style.backgroundColor = color.hex; // validated #rrggbb from the parsed catalog
    swatch.dataset.testid = `swatch-${target}-${color.id}`; // lets the panel restore focus after a re-render
    swatch.addEventListener('click', () => run(materialOps(target, 'color', { catalogId: color.id })));
    row.append(swatch);
  });
  return row;
}

function customColour({ appearance, run, target, label }) {
  const current = appearance.color.custom ? appearance.color : null;
  const name = el('input', { className: 'field__input', attrs: { type: 'text', maxlength: '80', placeholder: 'Name, e.g. Sage green', 'aria-label': `${label} custom colour name` } });
  name.value = current?.name ?? '';
  const picker = el('input', { className: 'colour-input', attrs: { type: 'color', 'aria-label': `${label} custom colour` } });
  picker.value = current?.hex ?? '#9caf88';
  const applyButton = button('Apply custom colour', () => {
    run(materialOps(target, 'color', { custom: true, name: name.value.trim() || 'Custom colour', hex: picker.value }));
  }, { variant: 'ghost' });
  const badge = current ? [el('p', { className: 'custom-badge', text: `Custom: ${current.name}` })] : [];
  return el('details', { className: 'custom-colour', attrs: current ? { open: '' } : {} }, [
    el('summary', { text: 'Custom colour…' }),
    ...badge,
    el('div', { className: 'custom-colour__row' }, [picker, name]),
    applyButton,
  ]);
}

function colourRow(context) {
  const { catalog, appearance } = context;
  const heading = el('p', { className: 'field__label' }, ['Colour: ', el('strong', { text: refName(appearance.color, catalog.colors) })]);
  return el('div', { className: 'appearance__row' }, [heading, swatches(context), customColour(context)]);
}

export function appearanceControls({ catalog, appearance, target, run, label }) {
  const material = appearance.material;
  const titleId = nextId('appearance');
  const context = { catalog, appearance, run, target, label };
  return el('div', { className: 'appearance', attrs: { role: 'group', 'aria-labelledby': titleId, 'data-testid': `appearance-${target}` } }, [
    el('div', { className: 'appearance__header' }, [
      el('h4', { className: 'appearance__title', text: label, attrs: { id: titleId } }),
      summary(context),
    ]),
    el('div', { className: 'appearance__row' }, [selectField({
      label: 'Material',
      testId: `material-${target}`,
      value: material.custom ? '' : material.catalogId,
      options: [
        ...(material.custom ? [{ value: '', label: `Custom: ${material.name}` }] : []),
        ...catalog.materials.map((m) => ({ value: m.id, label: m.name })),
      ],
      onChange: (id) => run(materialOps(target, 'material', { catalogId: id })),
    })]),
    colourRow(context),
    el('div', { className: 'appearance__row' }, [segmented({
      label: 'Finish',
      testId: `finish-${target}`,
      value: appearance.finish.custom ? null : appearance.finish.catalogId,
      options: catalog.finishes.map((f) => ({ value: f.id, label: f.name })),
      onChange: (id) => run(materialOps(target, 'finish', { catalogId: id })),
    })]),
  ]);
}
