// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { applyOps } from '../domain/apply.js';
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmField, countField, el, presetChips, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';

// ASSUMPTION: configurable convenience defaults (cm) for the one-click chips, NOT approved
// business or manufacturing rules. Change them here only.
const DIMENSION_PRESETS_CM = Object.freeze({
  width: [150, 200, 250],
  height: [200, 220, 240],
  depth: [45, 55, 60],
});

/** Dry run on the current design: a preset that the domain would reject is shown disabled. */
function isAllowed(design, catalog, ops) {
  try {
    applyOps(design, ops, catalog);
    return true;
  } catch {
    return false;
  }
}

function dimensionField(design, catalog, run, { field, label, onPickResult }) {
  const mm = design.dimensions[field];
  const node = cmField({ label, mm, testId: `dim-${field}`, onCommit: (value) => run(dimensionOps(field, value)) });
  node.append(presetChips({
    label: `Common ${label.toLowerCase()}s (cm)`,
    testId: `dim-${field}-presets`,
    options: DIMENSION_PRESETS_CM[field].map((cm) => ({
      label: String(cm),
      pressed: cm * 10 === mm,
      disabled: !isAllowed(design, catalog, dimensionOps(field, cm * 10)),
      onPick: () => onPickResult(run(dimensionOps(field, cm * 10))),
    })),
  }));
  return node;
}

function dimensionsRow(design, catalog, run, onPickResult) {
  return el('div', { className: 'field-row field-row--3' }, [
    dimensionField(design, catalog, run, { field: 'width', label: 'Width', onPickResult }),
    dimensionField(design, catalog, run, { field: 'height', label: 'Height', onPickResult }),
    dimensionField(design, catalog, run, { field: 'depth', label: 'Depth', onPickResult }),
  ]);
}

export function wardrobeSection({ design, catalog, run }) {
  const { doors } = design;
  const wardrobe = section('Wardrobe', []);
  wardrobe.append(dimensionsRow(design, catalog, run, (result) => actionResult(wardrobe, result)));
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
