// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Catalog values and customer-defined custom colours stay visibly distinct.
import { button, el, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';
import { catalogName, t } from '../ui/i18n.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;

function swatches({ catalog, appearance, run, target }) {
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': t().editor.colour } });
  catalog.colors.forEach((color) => {
    const name = catalogName(color);
    const swatch = el('button', {
      className: 'swatch',
      attrs: { type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(isCatalog(appearance.color, color.id)) },
    });
    swatch.style.backgroundColor = color.hex; // validated #rrggbb from the parsed catalog
    swatch.addEventListener('click', () => run(materialOps(target, 'color', { catalogId: color.id })));
    row.append(swatch);
  });
  return row;
}

function customColour({ appearance, run, target }) {
  const s = t().editor;
  const current = appearance.color.custom ? appearance.color : null;
  const name = el('input', { className: 'field__input', attrs: { type: 'text', maxlength: '80', placeholder: s.customNamePlaceholder, 'aria-label': s.customNameLabel } });
  name.value = current?.name ?? '';
  const picker = el('input', { className: 'colour-input', attrs: { type: 'color', 'aria-label': s.customPicker } });
  picker.value = current?.hex ?? '#9caf88';
  const applyButton = button(s.applyCustom, () => {
    run(materialOps(target, 'color', { custom: true, name: name.value.trim() || s.customDefaultName, hex: picker.value }));
  }, { variant: 'ghost' });
  const badge = current ? [el('p', { className: 'custom-badge', text: s.customPrefix(current.name) })] : [];
  return el('details', { className: 'custom-colour', attrs: current ? { open: '' } : {} }, [
    el('summary', { text: s.customSummary }),
    ...badge,
    el('div', { className: 'custom-colour__row' }, [picker, name]),
    applyButton,
  ]);
}

export function appearanceControls({ catalog, appearance, target, run, label }) {
  const material = appearance.material;
  const s = t().editor;
  return el('div', { className: 'appearance' }, [
    el('p', { className: 'appearance__label', text: label }),
    selectField({
      label: s.material,
      value: material.custom ? '' : material.catalogId,
      options: [
        ...(material.custom ? [{ value: '', label: s.customPrefix(material.name) }] : []),
        ...catalog.materials.map((m) => ({ value: m.id, label: catalogName(m) })),
      ],
      onChange: (id) => run(materialOps(target, 'material', { catalogId: id })),
    }),
    swatches({ catalog, appearance, run, target }),
    customColour({ appearance, run, target }),
    segmented({
      label: s.finish,
      value: appearance.finish.custom ? null : appearance.finish.catalogId,
      options: catalog.finishes.map((f) => ({ value: f.id, label: catalogName(f) })),
      onChange: (id) => run(materialOps(target, 'finish', { catalogId: id })),
    }),
  ]);
}
