// The people who live with the wardrobe (design.household.people): up to six, each with an optional name and a
// height. They stand beside the wardrobe as scale figures, and anyone under 140 cm counts as a child: Bob and
// advisory R26 then cover anchoring the wardrobe and child locks. Handlers read the design at commit time
// (current()): the panel's fields outlive their render.
import { button, cmField, collapsibleSection, el, textField } from './fields.js';
import { CHILD_HEIGHT } from '../domain/defaults.js';

export const MAX_PEOPLE = 6;
export const ADULT = 1700;
export const CHILD = 1100;

/** set_household ops for the list with person `index` changed by `patch` (null removes them). */
export function householdOps(people, index, patch) {
  const next = people.map((p) => ({ name: p.name ?? null, height: p.height, at: p.at ?? null })); // where they stand stays (ADR-041)
  if (patch === null) next.splice(index, 1);
  else next[index] = { ...next[index], ...patch };
  return [{ op: 'set_household', people: next }];
}

export function householdSection({ design, run, current = () => design }) {
  const people = design.household?.people ?? [];
  const now = () => current().household?.people ?? [];
  const children = people.filter((p) => p.height < CHILD_HEIGHT).length;
  const section = collapsibleSection('household', 'בני הבית', [
    el('p', {
      className: 'panel__note',
      text: 'דמויות בקנה מידה ליד הארון. מתחת ל-140 ס״מ נחשב ילד, ובוב מוסיף ייעוץ בטיחות: קיבוע לקיר ונעילת ילדים.',
    }),
  ]);
  people.forEach((person, i) => {
    const remove = button('הסרה', () => run(householdOps(now(), i, null)), { variant: 'ghost', testId: `person-remove-${i}` });
    section.append(el('div', { className: 'person-row', attrs: { role: 'group', 'aria-label': `דמות ${i + 1}` } }, [
      textField({
        label: 'שם (לא חובה)', value: person.name ?? '', testId: `person-name-${i}`,
        onCommit: (text) => run(householdOps(now(), i, { name: text.trim() ? Array.from(text.trim()).slice(0, 30).join('') : null })),
      }),
      cmField({
        label: person.height < CHILD_HEIGHT ? 'גובה (ילד)' : 'גובה', mm: person.height, testId: `person-height-${i}`,
        onCommit: (mm) => (mm === null ? { ok: true } : run(householdOps(now(), i, { height: mm }))),
      }),
      remove,
    ]));
  });
  if (people.length < MAX_PEOPLE) {
    const add = (height) => () => run([{ op: 'set_household', people: [...now().map((p) => ({ name: p.name ?? null, height: p.height, at: p.at ?? null })), { name: null, height }] }]);
    section.append(el('div', { className: 'person-add' }, [
      button('+ מבוגר', add(ADULT), { variant: 'secondary', testId: 'person-add-adult' }),
      button('+ ילד', add(CHILD), { variant: 'secondary', testId: 'person-add-child' }),
    ]));
  }
  if (children) {
    section.append(el('p', { className: 'panel__note person-note', text: children === 1 ? 'יש ילד ברשימה: הייעוץ כולל בטיחות ילדים.' : `יש ${children} ילדים ברשימה: הייעוץ כולל בטיחות ילדים.` }));
  }
  return section;
}
