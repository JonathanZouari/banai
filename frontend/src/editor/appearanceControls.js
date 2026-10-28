// Material / colour / finish controls for one appearance target (carcass, doors, item).
// Colours are curated per material: only the decors a material is offered in are shown, each with
// its name. A design that already holds a custom colour (e.g. from an earlier version) shows it as
// a read-only chip, visibly distinct from catalog values.
import { el, segmented, selectField } from './fields.js';
import { materialOps } from './opsFromForm.js';
import { coloursFor } from '../domain/catalog.js';
import { catalogName, t, tf } from '../i18n/strings.js';

const isCatalog = (ref, id) => !ref.custom && ref.catalogId === id;

function swatch({ name, hex, kind, pressed, onClick, testId }) {
  const chip = el('span', { className: `swatch${kind === 'wood' ? ' swatch--wood' : ''}`, attrs: { 'aria-hidden': 'true' } });
  if (hex) chip.style.backgroundColor = hex; // validated #rrggbb (catalog or custom ref)
  const node = el('button', {
    className: 'swatch-option',
    attrs: { type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(pressed) },
  }, [chip, el('span', { className: 'swatch-option__name', text: name })]);
  if (testId) node.dataset.testid = testId;
  if (onClick) node.addEventListener('click', onClick);
  else node.disabled = true;
  return node;
}

function swatches({ catalog, appearance, run, target }) {
  const { material, color } = appearance;
  const offered = material.custom ? catalog.colors : coloursFor(catalog, material.catalogId);
  // A catalog colour the material does not list (e.g. set by the agent) is still shown while selected.
  const current = !color.custom && !offered.some((c) => c.id === color.catalogId) ? catalog.colors.filter((c) => c.id === color.catalogId) : [];
  const row = el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': t('edColour') } });
  if (color.custom) {
    row.append(swatch({ name: tf('edCustomBadge', { name: color.name }), hex: color.hex, pressed: true, testId: `swatch-${target}-custom` }));
  }
  [...current, ...offered].forEach((c) => row.append(swatch({
    name: catalogName(c),
    hex: c.hex,
    kind: c.kind,
    pressed: isCatalog(color, c.id),
    testId: `swatch-${target}-${c.id}`,
    onClick: () => run(materialOps(target, 'color', { catalogId: c.id })),
  })));
  return row;
}

/** Changing the material keeps the colour when the new material offers it, else picks its first colour. */
export function materialChangeOps(catalog, appearance, target, materialId) {
  const offered = coloursFor(catalog, materialId);
  const keep = !appearance.color.custom && offered.some((c) => c.id === appearance.color.catalogId);
  const op = { op: 'set_material', target, material: { catalogId: materialId } };
  if (!keep && offered.length > 0) op.color = { catalogId: offered[0].id };
  return [op];
}

export function appearanceControls({ catalog, appearance, target, run, label }) {
  const material = appearance.material;
  return el('div', { className: 'appearance' }, [
    el('p', { className: 'appearance__label', text: label }),
    selectField({
      label: t('edMaterial'),
      value: material.custom ? '' : material.catalogId,
      options: [
        ...(material.custom ? [{ value: '', label: tf('edCustomBadge', { name: material.name }) }] : []),
        ...catalog.materials.map((m) => ({ value: m.id, label: catalogName(m) })),
      ],
      onChange: (id) => run(materialChangeOps(catalog, appearance, target, id)),
      testId: `material-${target}`,
    }),
    el('p', { className: 'field__label', text: t('edColour') }),
    swatches({ catalog, appearance, run, target }),
    segmented({
      label: t('edFinish'),
      value: appearance.finish.custom ? null : appearance.finish.catalogId,
      options: catalog.finishes.map((f) => ({ value: f.id, label: catalogName(f) })),
      onChange: (id) => run(materialOps(target, 'finish', { catalogId: id })),
    }),
  ]);
}
