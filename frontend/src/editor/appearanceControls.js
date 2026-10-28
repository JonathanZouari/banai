// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Catalog values and customer-defined custom colours stay visibly distinct.
import { button, el, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';
import { catalogName, strings } from '../ui/i18n.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;

function swatches({ catalog, appearance, run, target }) {
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': strings().colour } });
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
  const t = strings();
  const current = appearance.color.custom ? appearance.color : null;
  const name = el('input', { className: 'field__input', attrs: { type: 'text', maxlength: '80', placeholder: t.customColourPlaceholder, 'aria-label': t.customColourName } });
  name.value = current?.name ?? '';
  const picker = el('input', { className: 'colour-input', attrs: { type: 'color', 'aria-label': t.customColour } });
  picker.value = current?.hex ?? '#9caf88';
  const applyButton = button(t.applyCustomColour, () => {
    run(materialOps(target, 'color', { custom: true, name: name.value.trim() || t.customColour, hex: picker.value }));
  }, { variant: 'ghost' });
  const badge = current ? [el('p', { className: 'custom-badge', text: t.custom(current.name) })] : [];
  return el('details', { className: 'custom-colour', attrs: current ? { open: '' } : {} }, [
    el('summary', { text: t.customColourMenu }),
    ...badge,
    el('div', { className: 'custom-colour__row' }, [picker, name]),
    applyButton,
  ]);
}

export function appearanceControls({ catalog, appearance, target, run, label }) {
  const t = strings();
  const material = appearance.material;
  return el('div', { className: 'appearance' }, [
    el('p', { className: 'appearance__label', text: label }),
    selectField({
      label: t.material,
      value: material.custom ? '' : material.catalogId,
      options: [
        ...(material.custom ? [{ value: '', label: t.custom(material.name) }] : []),
        ...catalog.materials.map((m) => ({ value: m.id, label: catalogName(m) })),
      ],
      onChange: (id) => run(materialOps(target, 'material', { catalogId: id })),
    }),
    swatches({ catalog, appearance, run, target }),
    customColour({ appearance, run, target }),
    segmented({
      label: t.finish,
      value: appearance.finish.custom ? null : appearance.finish.catalogId,
      options: catalog.finishes.map((f) => ({ value: f.id, label: catalogName(f) })),
      onChange: (id) => run(materialOps(target, 'finish', { catalogId: id })),
    }),
  ]);
}
