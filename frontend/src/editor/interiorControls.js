// Interior of one compartment (schema v2): presets, inserts and the split door, plus the fields
// of a selected insert. Every change is ops; the engine decides what fits.
import { artNode, INSERT_ART, PRESET_ART } from './art.js';
import { cmField, countField, el, segmented, switchField } from './fields.js';
import {
  addInsertCandidates, compartmentLeaves, INSERT_OPTIONS, MAX_ZONES, PRESET_OPTIONS, presetOps, runFirst, spannedBy, splitOps,
  zoneDoorOps, zonePresetOps, zonesOf, zonesOps,
} from './interiorOps.js';
import { toCmText } from './opsFromForm.js';

const INSERT_NOTES = Object.freeze({
  pulldown: 'מוט שיורד בשליפה, למדפים גבוהים. מיוצר ברוחב 83–115 ס״מ.',
  shoes: 'מדפים משופעים, 24 ס״מ לקומה.',
  trousers: 'מסגרת נשלפת עם מוטות למכנסיים מקופלים.',
  led: 'פס LED עם חיישן דלת. צריך נקודת חשמל.',
});

function tile({ className, art, label, testId, pressed = null, onClick }) {
  const node = el('button', { className, attrs: { type: 'button', 'data-testid': testId, 'data-key': testId } }, [artNode(art), el('span', { text: label })]);
  if (pressed !== null) node.setAttribute('aria-pressed', String(pressed));
  node.addEventListener('click', onClick);
  return node;
}

const LEAVES = Object.freeze([{ value: '0', label: 'ללא' }, { value: '1', label: 'דלת' }, { value: '2', label: 'זוג' }]);

/** The zones control (1–4) and, when zoned, one row per zone: its door and a preset, top zone first. */
function zoneControls({ design, compartment, runAction }) {
  if (spannedBy(design, compartment.id)) {
    return [el('p', { className: 'field__hint', text: 'דלת אחת מכסה את התא הזה ואת השכן שלו. כדי לחלק אותו לאזורים, תנו לכל תא דלת משלו.' })];
  }
  const zones = zonesOf(design, compartment);
  const count = segmented({
    label: 'אזורים', testId: 'zones-count', value: String(zones.length),
    options: Array.from({ length: MAX_ZONES }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    onChange: (value) => runAction(zonesOps(compartment.id, Number(value))),
  });
  if (zones.length === 1) return [count];
  const hinged = design.doors.type === 'hinged';
  const rows = [...zones].reverse().map(({ zone, low, high, leaves }) => {
    const where = zone === zones.length ? ' · עליון' : zone === 1 ? ' · תחתון' : '';
    const presets = el('div', { className: 'zone-row__presets', attrs: { role: 'group', 'aria-label': `סידור לאזור ${zone}` } },
      PRESET_OPTIONS.map(({ value, label }) => {
        const node = el('button', {
          className: 'preset preset--mini',
          attrs: { type: 'button', title: label, 'aria-label': `${label} באזור ${zone}`, 'data-testid': `zone-${zone}-preset-${value}`, 'data-key': `zone-${zone}-preset-${value}` },
        }, [artNode(PRESET_ART[value])]);
        node.addEventListener('click', () => runAction(zonePresetOps(compartment.id, zone, value)));
        return node;
      }));
    return el('li', { className: 'zone-row', attrs: { 'data-testid': `zone-${zone}` } }, [
      el('div', { className: 'zone-row__head' }, [
        el('span', { className: 'zone-row__title', text: `אזור ${zone}${where}` }),
        el('span', { className: 'zone-row__size', text: `${toCmText(high - low)} ס״מ` }),
      ]),
      ...(hinged ? [segmented({
        label: 'דלת', testId: `zone-${zone}-door`, value: String(leaves), options: LEAVES,
        onChange: (value) => runAction(zoneDoorOps(compartment.id, zone, Number(value))),
      })] : []),
      presets,
    ]);
  });
  return [count, el('ol', { className: 'zone-list', attrs: { 'aria-label': 'אזורים בתא, מלמעלה למטה' } }, rows)];
}

/** Zones, presets, insert toggles and the split switch for the selected compartment. */
export function compartmentInterior({ design, compartment, run, runAction, report }) {
  const zoned = zonesOf(design, compartment).length > 1;
  const presets = el('div', { className: 'preset-grid', attrs: { role: 'group', 'aria-label': 'סידור פנים' } },
    PRESET_OPTIONS.map(({ value, label }) => tile({
      className: 'preset', art: PRESET_ART[value], label, testId: `preset-${value}`,
      onClick: () => runAction(presetOps(compartment.id, value)),
    })));
  const inserts = el('div', { className: 'insert-grid', attrs: { role: 'group', 'aria-label': 'רכיבים בתא' } },
    INSERT_OPTIONS.map(({ value, label }) => {
      const current = compartment.inserts.find((item) => item.type === value);
      return tile({
        className: 'insert', art: INSERT_ART[value], label, testId: `insert-${value}`, pressed: Boolean(current),
        onClick: () => report(current
          ? run([{ op: 'remove_component', id: current.id }])
          : runFirst(run, addInsertCandidates(compartment, value))),
      });
    }));
  const nodes = [
    ...zoneControls({ design, compartment, runAction }),
    ...(zoned ? [] : [el('div', { className: 'field' }, [el('span', { className: 'field__label', text: 'סידור מוכן' }), presets,
      el('p', { className: 'field__hint', text: 'מחליף את המדפים, המוטות והמגירות בתא. תאורה נשארת.' })])]),
    el('div', { className: 'field' }, [el('span', { className: 'field__label', text: 'רכיבים' }), inserts]),
  ];
  const leaves = compartmentLeaves(design, compartment.id);
  if (!zoned && (leaves.length === 1 || leaves.length === 2)) {
    nodes.push(switchField({
      label: 'שתי דלתות לתא', checked: leaves.length === 2, testId: 'split-door',
      onChange: (on) => runAction(splitOps(design, compartment.id, on)),
    }));
  }
  return nodes;
}

/** Fields of a selected insert; which ones depends on its type. */
export function insertFields({ insert, run }) {
  const { id } = insert;
  const modify = (field) => (value) => run([{ op: 'modify_insert', id, [field]: value }]);
  const nodes = [el('p', { className: 'panel__note', text: INSERT_NOTES[insert.type] })];
  if (insert.y !== null) nodes.push(cmField({ label: 'גובה מהבסיס', mm: insert.y, testId: 'insert-y', onCommit: modify('y') }));
  if (insert.type === 'shoes') nodes.push(countField({ label: 'קומות', value: insert.tiers, testId: 'insert-tiers', onCommit: modify('tiers') }));
  if (insert.type === 'trousers') nodes.push(cmField({ label: 'גובה המתקן', mm: insert.height, testId: 'insert-height', onCommit: modify('height') }));
  return nodes;
}
