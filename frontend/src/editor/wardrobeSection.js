// Wardrobe-wide settings, one group per panel step: overall dimensions, doors, main materials.
// Inputs report their own errors inline; buttons/selects report under their group.
import { appearanceControls } from './appearanceControls.js';
import { actionResult, cmField, countField, el, segmented } from './fields.js';
import { dimensionOps, doorTypeOps } from './opsFromForm.js';
import { rangeCm } from './steps.js';
import { t } from '../ui/i18n.js';

/** Step 1: width, height, depth, with the allowed range shown up front and named in errors. */
export function dimensionsGroup({ design, run }) {
  const s = t().editor;
  const field = (name) => {
    const [min, max] = rangeCm(name);
    return cmField({
      label: s[name],
      mm: design.dimensions[name],
      testId: `dim-${name}`,
      onCommit: (mm) => {
        const result = run(dimensionOps(name, mm));
        if (result.ok) return result;
        // Clearer than the generic messages: which field, and why.
        const code = result.error?.code;
        if (code === 'OUT_OF_RANGE') return { ok: false, message: s.rangeError(s[name], min, max) };
        if (code === 'OUT_OF_BOUNDS' || code === 'OVERLAP') return { ok: false, message: s.dimensionBlocked(s[name]) };
        return result;
      },
    });
  };
  const hint = el('p', { className: 'panel__note', text: s.rangeHint(rangeCm('width'), rangeCm('height'), rangeCm('depth')) });
  hint.dataset.testid = 'dim-range';
  return el('div', { className: 'prop-group' }, [
    el('div', { className: 'field-row field-row--3' }, ['width', 'height', 'depth'].map(field)),
    hint,
  ]);
}

/** Step 2: door type, and the number of panels for sliding doors. */
export function doorsGroup({ design, run }) {
  const s = t().editor;
  const { doors } = design;
  const group = el('div', { className: 'prop-group' });
  group.append(segmented({
    label: s.doors,
    testId: 'door-type',
    value: doors.type,
    options: ['hinged', 'sliding', 'none'].map((value) => ({ value, label: s.doorTypes[value] })),
    onChange: (type) => actionResult(group, run(doorTypeOps(type))),
  }));
  if (doors.type === 'sliding') {
    group.append(countField({
      label: s.slidingPanels, value: doors.items.length, testId: 'sliding-count',
      onCommit: (count) => run(doorTypeOps('sliding', count)),
    }));
  }
  return group;
}

/** Step 4: carcass and door appearance (material, colour, finish). */
export function materialsGroup({ design, catalog, run }) {
  const s = t().editor;
  const group = el('div', { className: 'prop-group' });
  const runMaterials = (ops) => actionResult(group, run(ops));
  group.append(appearanceControls({ catalog, appearance: design.carcass.appearance, target: 'carcass', run: runMaterials, label: s.carcassAppearance }));
  if (design.doors.type !== 'none') {
    group.append(appearanceControls({ catalog, appearance: design.doors.appearance, target: 'doors', run: runMaterials, label: s.doorsAppearance }));
  }
  return group;
}
