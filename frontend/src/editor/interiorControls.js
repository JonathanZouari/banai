// Interior of one compartment (schema v2): presets, inserts and the split door, plus the fields
// of a selected insert. Every change is ops; the engine decides what fits.
import { artNode, INSERT_ART, PRESET_ART } from './art.js';
import { cmField, countField, el, switchField } from './fields.js';
import {
  addInsertCandidates, compartmentLeaves, INSERT_OPTIONS, PRESET_OPTIONS, presetOps, runFirst, splitOps,
} from './interiorOps.js';

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

/** Presets, insert toggles and the split switch for the selected compartment. */
export function compartmentInterior({ design, compartment, run, runAction, report }) {
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
    el('div', { className: 'field' }, [el('span', { className: 'field__label', text: 'סידור מוכן' }), presets,
      el('p', { className: 'field__hint', text: 'מחליף את המדפים, המוטות והמגירות בתא. תאורה נשארת.' })]),
    el('div', { className: 'field' }, [el('span', { className: 'field__label', text: 'רכיבים' }), inserts]),
  ];
  const leaves = compartmentLeaves(design, compartment.id);
  if (leaves.length === 1 || leaves.length === 2) {
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
