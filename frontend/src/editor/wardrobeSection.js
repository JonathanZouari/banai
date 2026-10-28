// Always-visible wardrobe settings: overall dimensions, and the main materials (a separate section).
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { t } from '../i18n/strings.js';
import { actionResult, chipRow, cmField, el, section } from './fields.js';
import { dimensionChips, dimensionOps } from './opsFromForm.js';

const DIMENSIONS = Object.freeze([
  { field: 'width', label: 'edWidth', chipsLabel: 'edCommonWidths' },
  { field: 'height', label: 'edHeight', chipsLabel: 'edCommonHeights' },
  { field: 'depth', label: 'edDepth', chipsLabel: 'edCommonDepths' },
]);

// One block per dimension: the field, then its common sizes. Picking a chip dispatches the same op as typing.
function dimensionsBlocks({ design, catalog, run }, container) {
  const runChip = (ops) => actionResult(container, run(ops));
  return DIMENSIONS.map(({ field, label, chipsLabel }) => el('div', { className: 'dim-block' }, [
    cmField({ label: t(label), mm: design.dimensions[field], testId: `dim-${field}`, onCommit: (mm) => run(dimensionOps(field, mm)) }),
    chipRow({
      label: t(chipsLabel), chips: dimensionChips(design, catalog, field), testIdPrefix: `dim-${field}-chip`,
      onPick: (mm) => runChip(dimensionOps(field, mm)),
    }),
  ]));
}

export function wardrobeSection(context) {
  const wardrobe = section(t('edWardrobe'), []);
  wardrobe.append(...dimensionsBlocks(context, wardrobe));
  return [wardrobe];
}

export function materialsSection({ design, catalog, run }) {
  const { doors } = design;
  const materials = section(t('edMaterials'), []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: t('edCarcass') }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: t('edDoors') }));
  }
  return [materials];
}
