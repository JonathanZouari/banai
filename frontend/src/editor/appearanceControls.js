// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Catalog values and customer-defined custom colours stay visibly distinct.
import { button, el, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';
import { VENEER_MATERIAL_ID, WOOD_COLOR_IDS } from '../domain/catalog.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;

const isDoorTarget = (target) => target === 'doors' || target.startsWith('dr_');

function swatchRow({ colors, appearance, run, target, label, wood }) {
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': label } });
  colors.forEach((color) => {
    const swatch = el('button', {
      className: `swatch${wood ? ' swatch--wood' : ''}`,
      attrs: { type: 'button', title: color.name, 'aria-label': color.name, 'aria-pressed': String(isCatalog(appearance.color, color.id)) },
    });
    swatch.style.backgroundColor = color.hex; // validated #rrggbb from the parsed catalog
    swatch.addEventListener('click', () => {
      // A wood tone on a door is a veneered front: set the veneer material with the tone in one op.
      const ops = wood && isDoorTarget(target)
        ? [{ op: 'set_material', target, material: { catalogId: VENEER_MATERIAL_ID }, color: { catalogId: color.id } }]
        : materialOps(target, 'color', { catalogId: color.id });
      run(ops);
    });
    row.append(swatch);
  });
  return row;
}

/** Solid colours and wood tones as two labelled rows (wood tones get a grain look in 3D). */
function swatches({ catalog, appearance, run, target }) {
  const solid = catalog.colors.filter((color) => !WOOD_COLOR_IDS.has(color.id));
  const wood = catalog.colors.filter((color) => WOOD_COLOR_IDS.has(color.id));
  return el('div', { className: 'swatch-groups' }, [
    el('span', { className: 'swatch-groups__label', text: 'Solid' }),
    swatchRow({ colors: solid, appearance, run, target, label: 'Solid colours', wood: false }),
    ...(wood.length ? [
      el('span', { className: 'swatch-groups__label', text: 'Wood' }),
      swatchRow({ colors: wood, appearance, run, target, label: 'Wood tones', wood: true }),
    ] : []),
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
