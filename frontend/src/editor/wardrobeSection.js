// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmFieldParts, collapsibleSection, countField, el, segmented } from './fields.js';
import { handleControls } from './handleControls.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';
import { dimensionRange } from './sliderRanges.js';

const DIMENSIONS = Object.freeze([
  { field: 'width', label: 'Width', testId: 'dim-width' },
  { field: 'height', label: 'Height', testId: 'dim-height' },
  { field: 'depth', label: 'Depth', testId: 'dim-depth' },
]);

// The three numbers share one row. Their sliders follow as a stack of full-width rows (an 80 px
// slider under each number would be too coarse), after all the inputs so Tab goes Width, Height,
// Depth first and then through the sliders.
function dimensionsRow(design, run) {
  const parts = DIMENSIONS.map(({ field, label, testId }) => cmFieldParts({
    label, testId, mm: design.dimensions[field], range: dimensionRange(field),
    onCommit: (mm) => run(dimensionOps(field, mm)),
  }));
  const sliders = parts.map(({ slider }, index) => el('div', { className: 'slider-row' }, [
    el('span', { className: 'slider-row__caption', text: DIMENSIONS[index].label, attrs: { 'aria-hidden': 'true' } }),
    slider,
  ]));
  return el('div', { className: 'dimensions' }, [
    el('div', { className: 'field-row field-row--3' }, parts.map(({ field }) => field)),
    el('div', { className: 'slider-stack' }, sliders),
  ]);
}

export function wardrobeSection({ design, catalog, run }) {
  const { doors } = design;
  const wardrobe = collapsibleSection('wardrobe', 'Wardrobe', [dimensionsRow(design, run)]);
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

  wardrobe.append(handleControls({
    label: 'Handles', testPrefix: 'handles', target: 'all', inherited: design.handles, run: runDoors,
  }));

  const materials = collapsibleSection('materials', 'Materials', []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: 'Carcass & interior' }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: 'Doors' }));
  }
  return [wardrobe, materials];
}
