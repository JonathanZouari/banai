// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmField, countField, el, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';

function dimensionsRow(design, run, unit) {
  const { width, height, depth } = design.dimensions;
  return el('div', { className: 'field-row field-row--3' }, [
    cmField({ label: 'Width', mm: width, testId: 'dim-width', unit, onCommit: (mm) => run(dimensionOps('width', mm)) }),
    cmField({ label: 'Height', mm: height, testId: 'dim-height', unit, onCommit: (mm) => run(dimensionOps('height', mm)) }),
    cmField({ label: 'Depth', mm: depth, testId: 'dim-depth', unit, onCommit: (mm) => run(dimensionOps('depth', mm)) }),
  ]);
}

export function wardrobeSection({ design, catalog, run, unit = 'cm', setUnit }) {
  const { doors } = design;
  const wardrobe = section('Wardrobe', [
    segmented({
      label: 'Units',
      testId: 'unit-selector',
      value: unit,
      options: [{ value: 'mm', label: 'mm' }, { value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }],
      onChange: setUnit,
    }),
    dimensionsRow(design, run, unit),
  ]);
  const runDoors = (ops) => actionResult(wardrobe, run(ops));
  wardrobe.append(segmented({
    label: 'Doors',
    testId: 'door-type',
    value: doors.type,
    options: [{ value: 'hinged', label: 'Hinged' }, { value: 'sliding', label: 'Sliding' }, { value: 'none', label: 'None' }],
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    wardrobe.append(countField({
      label: 'Sliding panels', value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }

  const materials = section('Materials', []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: 'Carcass & interior' }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: 'Doors' }));
  }
  return [wardrobe, materials];
}
