// Wardrobe-level inspector (nothing selected): size, sections, doors and finish.
// Inputs report their own errors inline; buttons/selects report under their section.
import { appearanceControls } from './appearanceControls.js';
import { compartmentsSection } from './compartmentsSection.js';
import { actionResult, cmField, countField, el, section, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';

function dimensionsRow(design, run) {
  const { width, height, depth } = design.dimensions;
  return el('div', { className: 'field-group' }, [
    cmField({ label: 'Width', mm: width, testId: 'dim-width', onCommit: (mm) => run(dimensionOps('width', mm)) }),
    cmField({ label: 'Height', mm: height, testId: 'dim-height', onCommit: (mm) => run(dimensionOps('height', mm)) }),
    cmField({ label: 'Depth', mm: depth, testId: 'dim-depth', onCommit: (mm) => run(dimensionOps('depth', mm)) }),
  ]);
}

export function wardrobeSection(context) {
  const { design, catalog, run } = context;
  const { doors } = design;
  const size = section('Size', [dimensionsRow(design, run)]);

  const doorsSection = section('Doors', []);
  const runDoors = (ops) => actionResult(doorsSection, run(ops));
  doorsSection.append(segmented({
    label: 'Door type',
    testId: 'door-type',
    value: doors.type,
    options: [{ value: 'hinged', label: 'Hinged' }, { value: 'sliding', label: 'Sliding' }, { value: 'none', label: 'None' }],
    onChange: (type) => runDoors(doorTypeOps(type)),
  }));
  if (doors.type === 'sliding') {
    doorsSection.append(countField({
      label: 'Sliding panels', value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }

  const finish = section('Finish', []);
  const runFinish = (ops) => actionResult(finish, run(ops));
  finish.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runFinish, label: 'Wardrobe body' }));
  if (doors.type !== 'none') {
    finish.append(appearanceControls({ catalog, appearance: doors.appearance, target: 'doors', run: runFinish, label: 'Doors' }));
  }
  return [size, compartmentsSection(context), doorsSection, finish];
}
