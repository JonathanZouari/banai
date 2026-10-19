// Always-visible wardrobe settings: overall dimensions, doors and main materials.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmField, cmFieldParts, collapsibleSection, countField, el, segmented, switchField } from './fields.js';
import { handleControls } from './handleControls.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';
import { dimensionRange } from './sliderRanges.js';

const DIMENSIONS = Object.freeze([
  { field: 'width', label: 'רוחב', testId: 'dim-width' },
  { field: 'height', label: 'גובה', testId: 'dim-height' },
  { field: 'depth', label: 'עומק', testId: 'dim-depth' },
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
  const wardrobe = collapsibleSection('wardrobe', 'ארון', [
    dimensionsRow(design, run),
    cmField({
      label: design.carcass.base === 'legs' ? 'גובה הרגליות' : 'צוקל (בסיס)', mm: design.carcass.plinthHeight,
      testId: 'plinth-height', range: { min: 0, max: 300 },
      onCommit: (mm) => run(dimensionOps('plinthHeight', mm)),
    }),
  ]);
  const runDoors = (ops) => actionResult(wardrobe, run(ops));
  wardrobe.append(segmented({
    label: 'בסיס',
    testId: 'base-type',
    value: design.carcass.base ?? 'plinth',
    options: [{ value: 'plinth', label: 'צוקל' }, { value: 'legs', label: 'רגליות' }],
    onChange: (base) => runDoors([{ op: 'set_fittings', base }]),
  }));
  wardrobe.append(segmented({
    label: 'דלתות',
    testId: 'door-type',
    value: doors.type,
    options: [{ value: 'hinged', label: 'ציר' }, { value: 'sliding', label: 'הזזה' }, { value: 'none', label: 'ללא' }],
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    wardrobe.append(countField({
      label: 'כנפי הזזה', value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }

  wardrobe.append(switchField({
    label: 'טריקה שקטה (צירים ומגירות)', checked: design.fittings?.softClose !== false, testId: 'soft-close',
    onChange: (on) => runDoors([{ op: 'set_fittings', softClose: on }]),
  }));
  wardrobe.append(handleControls({
    label: 'ידיות', testPrefix: 'handles', target: 'all', inherited: design.handles, run: runDoors,
  }));

  const materials = collapsibleSection('materials', 'חומרים', []);
  const runMaterials = (ops) => actionResult(materials, run(ops));
  materials.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: 'גוף ופנים' }));
  if (doors.type !== 'none') {
    materials.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runMaterials, label: 'חזיתות' }));
  }
  return [wardrobe, materials];
}
