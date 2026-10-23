// Household: the people who live with the wardrobe, by height, drawn beside it in 3D. A child
// (under CHILD_HEIGHT) raises a climbing warning that suggests anchoring and a safety lock.
// Client-only: edits go to store.setHousehold, never to the design or the server.
import {
  ADULT_DEFAULT, CHILD_DEFAULT, HEIGHT_RANGE, MAX_NAME, MAX_PEOPLE, childSafety, isChild, newPerson, validHeight,
} from '../household/household.js';
import { toCmText } from './opsFromForm.js';
import { button, cmField, el, section } from './fields.js';

const cm = (mm) => toCmText(mm).replace(/\.0$/, '');

function nameField(person, onCommit) {
  const id = `person-name-${person.id}`;
  const input = el('input', {
    className: 'field__input',
    attrs: { id, type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off', placeholder: 'לא חובה', 'data-testid': `person-name-${person.id}` },
  });
  input.value = person.name;
  input.addEventListener('change', () => onCommit(input.value));
  return el('div', { className: 'field' }, [el('label', { className: 'field__label', text: 'שם', attrs: { for: id } }), input]);
}

function personRow(person, index, design, update, remove) {
  const share = Math.round((person.height / design.dimensions.height) * 100);
  const title = person.name || `אדם ${index + 1}`;
  return el('li', { className: 'person-row', attrs: { 'data-testid': `person-${person.id}` } }, [
    el('div', { className: 'person-row__head' }, [
      el('strong', { text: title }),
      el('span', { className: `person-row__tag${isChild(person) ? ' person-row__tag--child' : ''}`, text: isChild(person) ? 'ילד' : 'מבוגר' }),
    ]),
    el('div', { className: 'field-row field-row--2' }, [
      nameField(person, (name) => update({ ...person, name })),
      cmField({
        label: 'גובה',
        mm: person.height,
        testId: `person-height-${person.id}`,
        onCommit: (mm) => (validHeight(mm)
          ? update({ ...person, height: mm })
          : { ok: false, message: `הגובה צריך להיות בין ${cm(HEIGHT_RANGE[0])} ל-${cm(HEIGHT_RANGE[1])} ס״מ` }),
      }),
    ]),
    el('p', { className: 'person-row__note', text: `${share}% מגובה הארון (${cm(design.dimensions.height)} ס״מ)` }),
    button('הסרה', remove, { variant: 'ghost', testId: `person-remove-${person.id}` }),
  ]);
}

function safetyAlert(design, safety) {
  const who = safety.count === 1 ? `בבית גר ילד בגובה ${cm(safety.tallest)} ס״מ.` : `בבית גרים ${safety.count} ילדים (הגבוה מהם ${cm(safety.tallest)} ס״מ).`;
  const steps = safety.steps
    ? ` ${safety.steps === 1 ? 'מגירה אחת מתחילה' : `${safety.steps} מגירות מתחילות`} מתחת ל-${cm(safety.tallest)} ס״מ, ואפשר לטפס עליהן כמו על מדרגות.`
    : '';
  const release = safety.releaseOnWall
    ? `ולחצן שחרור על הקיר ליד הארון, בגובה ${cm(safety.releaseHeight)} ס״מ לפחות (הארון ${cm(design.dimensions.height)} ס״מ)`
    : `ולחצן שחרור בגובה ${cm(safety.releaseHeight)} ס״מ לפחות`;
  return el('aside', { className: 'safety-alert', attrs: { 'aria-label': 'בטיחות ילדים', 'data-testid': 'child-safety' } }, [
    el('strong', { className: 'safety-alert__title', text: 'בטיחות ילדים: סכנת טיפוס' }),
    el('p', { text: `${who} ילדים מטפסים על מגירות ודלתות פתוחות, וארון שמתהפך הוא הסכנה העיקרית.${steps}` }),
    el('ul', { className: 'safety-alert__list' }, [
      el('li', { text: 'לקבע את הארון לקיר לפני השימוש.' }),
      el('li', {
        attrs: { 'data-testid': 'child-lock-suggestion' },
        text: `מומלץ: נעילת הגנה לילדים בכל ${safety.hasDoors ? 'דלת ומגירה' : 'מגירה'}, ${release}, מעל טווח ההגעה של ילד עומד (הערכה: פי 1.3 מגובהו).`,
      }),
    ]),
    el('p', { className: 'safety-alert__note', text: 'נעילה מרתיעה, אבל לא מחליפה השגחה. זו המלצה לנגר, לא אישור בטיחות.' }),
  ]);
}

export function householdSection({ design, household, setHousehold }) {
  const update = (person) => {
    setHousehold(household.map((p) => (p.id === person.id ? person : p)));
    return { ok: true };
  };
  const remove = (id) => () => setHousehold(household.filter((p) => p.id !== id));
  const add = (height) => () => setHousehold([...household, newPerson(height)]);
  const full = household.length >= MAX_PEOPLE;
  const safety = childSafety(design, household);

  const container = section('בני הבית', [
    el('p', { className: 'panel__hint', text: 'מי ישתמש בארון? כל אחד מופיע לידו בתלת-ממד בגובה שלו. נשמר רק בדפדפן הזה.' }),
    ...(safety ? [safetyAlert(design, safety)] : []),
    el('ol', { className: 'person-list' }, household.map((p, i) => personRow(p, i, design, update, remove(p.id)))),
    el('div', { className: 'button-row button-row--pair' }, [
      button(`+ מבוגר (${cm(ADULT_DEFAULT)} ס״מ)`, add(ADULT_DEFAULT), { testId: 'add-adult', disabled: full }),
      button(`+ ילד (${cm(CHILD_DEFAULT)} ס״מ)`, add(CHILD_DEFAULT), { testId: 'add-child', disabled: full }),
    ]),
  ]);
  // The rest of the panel is in English; this section is Hebrew, right to left.
  container.lang = 'he';
  container.dir = 'rtl';
  return container;
}
