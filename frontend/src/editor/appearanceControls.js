// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Catalog values and customer-defined custom colours stay visibly distinct.
import { button, el, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;

function swatches({ catalog, appearance, run, target }) {
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': 'צבע' } });
  catalog.colors.forEach((color) => {
    const swatch = el('button', {
      className: 'swatch',
      attrs: { type: 'button', title: color.name, 'aria-label': color.name, 'aria-pressed': String(isCatalog(appearance.color, color.id)), 'data-key': `Colour/${color.name}` },
    });
    swatch.style.backgroundColor = color.hex; // validated #rrggbb from the parsed catalog
    if (color.grain) swatch.dataset.grain = color.grain; // wood: CSS paints the grain over the colour
    swatch.addEventListener('click', () => run(materialOps(target, 'color', { catalogId: color.id })));
    row.append(swatch);
  });
  const selected = appearance.color.custom ? appearance.color.name : catalog.colors.find((c) => c.id === appearance.color.catalogId)?.name ?? '';
  return el('div', { className: 'swatch-group' }, [
    el('div', { className: 'swatch-group__head' }, [
      el('span', { className: 'field__label', text: 'צבע' }),
      el('span', { className: 'swatch-group__name', text: selected }),
    ]),
    row,
  ]);
}

function customColour({ appearance, run, target }) {
  const current = appearance.color.custom ? appearance.color : null;
  const name = el('input', { className: 'field__input', attrs: { type: 'text', maxlength: '80', placeholder: 'שם, למשל ירוק מרווה', 'aria-label': 'שם הצבע המותאם', 'data-key': 'Custom colour name' } });
  name.value = current?.name ?? '';
  const picker = el('input', { className: 'colour-input', attrs: { type: 'color', 'aria-label': 'צבע מותאם', 'data-key': 'Custom colour' } });
  picker.value = current?.hex ?? '#9caf88';
  const applyButton = button('החלת צבע מותאם', () => {
    run(materialOps(target, 'color', { custom: true, name: name.value.trim() || 'צבע מותאם', hex: picker.value }));
  }, { variant: 'ghost' });
  const badge = current ? [el('p', { className: 'custom-badge', text: `מותאם: ${current.name}` })] : [];
  return el('details', { className: 'custom-colour', attrs: current ? { open: '' } : {} }, [
    el('summary', { text: 'צבע מותאם…', attrs: { 'data-key': 'summary' } }),
    ...badge,
    el('div', { className: 'custom-colour__row' }, [picker, name]),
    applyButton,
  ]);
}

export function appearanceControls({ catalog, appearance, target, run, label }) {
  const material = appearance.material;
  return el('div', { className: 'appearance', attrs: { 'data-group': label } }, [
    el('p', { className: 'appearance__label', text: label }),
    selectField({
      label: 'חומר',
      value: material.custom ? '' : material.catalogId,
      options: [
        ...(material.custom ? [{ value: '', label: `מותאם: ${material.name}` }] : []),
        ...catalog.materials.map((m) => ({ value: m.id, label: m.name })),
      ],
      onChange: (id) => run(materialOps(target, 'material', { catalogId: id })),
    }),
    swatches({ catalog, appearance, run, target }),
    customColour({ appearance, run, target }),
    segmented({
      label: 'גימור',
      value: appearance.finish.custom ? null : appearance.finish.catalogId,
      options: catalog.finishes.map((f) => ({ value: f.id, label: f.name })),
      onChange: (id) => run(materialOps(target, 'finish', { catalogId: id })),
    }),
  ]);
}
