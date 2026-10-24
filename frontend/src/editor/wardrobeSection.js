// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmField, countField, el, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';
import { t } from '../ui/i18n.js';

function dimensionsRow(design, run) {
  const { width, height, depth } = design.dimensions;
  const s = t().editor;
  return el('div', { className: 'field-row field-row--3' }, [
    cmField({ label: s.width, mm: width, testId: 'dim-width', onCommit: (mm) => run(dimensionOps('width', mm)) }),
    cmField({ label: s.height, mm: height, testId: 'dim-height', onCommit: (mm) => run(dimensionOps('height', mm)) }),
    cmField({ label: s.depth, mm: depth, testId: 'dim-depth', onCommit: (mm) => run(dimensionOps('depth', mm)) }),
  ]);
}

export function wardrobeSection({ design, catalog, run }) {
  const { doors } = design;
  const s = t().editor;
  const wardrobe = section(s.wardrobe, [dimensionsRow(design, run)]);
  const runDoors = (ops) => actionResult(wardrobe, run(ops));
  wardrobe.append(segmented({
    label: s.doors,
    testId: 'door-type',
    value: doors.type,
    options: ['hinged', 'sliding', 'none'].map((value) => ({ value, label: s.doorTypes[value] })),
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    wardrobe.append(countField({
      label: s.slidingPanels, value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }

  const materials = section(s.materials, []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: s.carcassAppearance }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: s.doorsAppearance }));
  }
  return [wardrobe, materials];
}
