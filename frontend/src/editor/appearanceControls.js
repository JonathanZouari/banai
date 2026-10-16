// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Catalog values and customer-defined custom colours stay visibly distinct.
import { button, el, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;

function swatch({ color, appearance, run, target }) {
  const node = el('button', {
    className: `swatch${color.texture === 'wood' ? ' swatch--wood' : ''}`,
    attrs: { type: 'button', title: color.name, 'aria-label': color.name, 'aria-pressed': String(isCatalog(appearance.color, color.id)) },
  });
  node.style.backgroundColor = color.hex; // validated #rrggbb from the parsed catalog
  node.addEventListener('click', () => run(materialOps(target, 'color', { catalogId: color.id })));
  return node;
}

/** Catalog colours in two labelled rows: plain colours, then real wood species. */
function swatches({ catalog, appearance, run, target }) {
  const groups = [
    { label: 'Colours', colors: catalog.colors.filter((c) => c.texture !== 'wood') },
    { label: 'Wood', colors: catalog.colors.filter((c) => c.texture === 'wood') },
  ].filter((group) => group.colors.length > 0);
  const selected = catalog.colors.find((c) => isCatalog(appearance.color, c.id));
  return el('div', { className: 'swatch-groups', attrs: { role: 'group', 'aria-label': 'Colour' } }, [
    ...groups.map((group) => el('div', { className: 'swatch-group' }, [
      el('span', { className: 'swatch-group__label', text: group.label }),
      el('div', { className: 'swatches' }, group.colors.map((color) => swatch({ color, appearance, run, target }))),
    ])),
    ...(selected ? [el('p', { className: 'swatch-current', text: selected.name })] : []),
  ]);
}

function customColour({ appearance, run, target }) {
  const current = appearance.color.custom ? appearance.color : null;
  const name = el('input', { className: 'field__input', attrs: { type: 'text', maxlength: '80', placeholder: 'Name, e.g. Sage green', 'aria-label': 'Custom colour name' } });
  name.value = current?.name ?? '';
  const picker = el('input', { className: 'colour-input', attrs: { type: 'color', 'aria-label': 'Custom colour' } });
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

export function appearanceControls({ catalog, appearance, target, run, label }) {
  const material = appearance.material;
  return el('div', { className: 'appearance' }, [
    el('p', { className: 'appearance__label', text: label }),
    selectField({
      label: 'Material',
      value: material.custom ? '' : material.catalogId,
      options: [
        ...(material.custom ? [{ value: '', label: `Custom: ${material.name}` }] : []),
        ...catalog.materials.map((m) => ({ value: m.id, label: m.name })),
      ],
      onChange: (id) => run(materialOps(target, 'material', { catalogId: id })),
    }),
    swatches({ catalog, appearance, run, target }),
    customColour({ appearance, run, target }),
    segmented({
      label: 'Finish',
      value: appearance.finish.custom ? null : appearance.finish.catalogId,
      options: catalog.finishes.map((f) => ({ value: f.id, label: f.name })),
      onChange: (id) => run(materialOps(target, 'finish', { catalogId: id })),
    }),
  ]);
}
