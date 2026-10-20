// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { t } from '../i18n/strings.js';
import { actionResult, cmField, countField, el, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps, slidingCountOps } from './opsFromForm.js';

function dimensionsRow(design, run) {
  const { width, height, depth } = design.dimensions;
  return el('div', { className: 'field-row field-row--3' }, [
    cmField({ label: t('edWidth'), mm: width, testId: 'dim-width', onCommit: (mm) => run(dimensionOps('width', mm)) }),
    cmField({ label: t('edHeight'), mm: height, testId: 'dim-height', onCommit: (mm) => run(dimensionOps('height', mm)) }),
    cmField({ label: t('edDepth'), mm: depth, testId: 'dim-depth', onCommit: (mm) => run(dimensionOps('depth', mm)) }),
  ]);
}

export function wardrobeSection({ design, catalog, run }) {
  const { doors } = design;
  const wardrobe = section(t('edWardrobe'), [dimensionsRow(design, run)]);
  const runDoors = (ops) => actionResult(wardrobe, run(ops));
  wardrobe.append(segmented({
    label: t('edDoors'),
    testId: 'door-type',
    value: doors.type,
    options: [{ value: 'hinged', label: t('edHinged') }, { value: 'sliding', label: t('edSliding') }, { value: 'none', label: t('edNone') }],
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    wardrobe.append(countField({
      label: t('edSlidingPanels'), value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(slidingCountOps(design, count)),
    }));
  }

  const materials = section(t('edMaterials'), []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: t('edCarcass') }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: t('edDoors') }));
  }
  return [wardrobe, materials];
}
