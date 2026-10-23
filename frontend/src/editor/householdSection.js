// Household: the people who live with the wardrobe, by height, drawn beside it in 3D. A child
// (under CHILD_HEIGHT) raises a climbing warning that suggests anchoring and a safety lock.
// Client-only: edits go to store.setHousehold, never to the design or the server.
import {
  ADULT_DEFAULT, CHILD_DEFAULT, HEIGHT_RANGE, MAX_NAME, MAX_PEOPLE, childSafety, isChild, newPerson, validHeight,
} from '../household/household.js';
import { toCmText } from './opsFromForm.js';
import { button, cmField, el, section } from './fields.js';

const cm = (mm) => toCmText(mm).replace(/\.0$/, '');
const focusTestId = (testId) => document.querySelector(`[data-testid="${CSS.escape(testId)}"]`)?.focus();

function nameField(person, onCommit) {
  const id = `person-name-${person.id}`;
  const input = el('input', {
    className: 'field__input',
    attrs: { id, type: 'text', dir: 'auto', maxlength: String(MAX_NAME), autocomplete: 'off', placeholder: 'לא חובה', 'data-testid': `person-name-${person.id}` },
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
    removeButton(title, remove, person.id),
  ]);
}

// Every remove button says whom it removes (they would all be "הסרה" otherwise).
function removeButton(title, remove, id) {
  const node = button('הסרה', remove, { variant: 'ghost', testId: `person-remove-${id}` });
  node.setAttribute('aria-label', `הסרת ${title}`);
  return node;
}

// What the lock goes on: only what this wardrobe has (doors, drawers), or the wardrobe itself when it has neither.
function lockTargets(design, safety) {
  const hasDrawers = design.compartments.some((c) => c.drawers.length);
  if (safety.hasDoors && hasDrawers) return 'בכל דלת ומגירה';
  if (safety.hasDoors) return 'בכל דלת';
  if (hasDrawers) return 'בכל מגירה';
  return 'כשיתווספו דלתות או מגירות';
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
        text: `מומלץ: נעילת הגנה לילדים ${lockTargets(design, safety)}, ${release}, מעל טווח ההגעה של ילד עומד (הערכה: פי 1.3 מגובהו).`,
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
  // After a removal the focus goes to the next person, else the previous one, else "+ מבוגר" (the panel re-renders
  // synchronously, so the new controls exist when setHousehold returns).
  const remove = (id) => () => {
    const index = household.findIndex((p) => p.id === id);
    const neighbour = household[index + 1] ?? household[index - 1];
    setHousehold(household.filter((p) => p.id !== id));
    focusTestId(neighbour ? `person-remove-${neighbour.id}` : 'add-adult');
  };
  const full = household.length >= MAX_PEOPLE;
  // At the limit the buttons stay focusable (aria-disabled) and a status line says why nothing is added.
  const add = (height) => () => {
    if (!full) setHousehold([...household, newPerson(height)]);
  };
  const addButton = (text, height, testId) => {
    const node = button(text, add(height), { testId });
    if (full) node.setAttribute('aria-disabled', 'true');
    return node;
  };
  const safety = childSafety(design, household);

  const container = section('בני הבית', [
    el('p', { className: 'panel__hint', text: 'מי ישתמש בארון? כל אחד מופיע לידו בתלת-ממד בגובה שלו. נשמר רק בדפדפן הזה.' }),
    ...(safety ? [safetyAlert(design, safety)] : []),
    el('ol', { className: 'person-list' }, household.map((p, i) => personRow(p, i, design, update, remove(p.id)))),
    el('div', { className: 'button-row button-row--pair' }, [
      addButton(`+ מבוגר (${cm(ADULT_DEFAULT)} ס״מ)`, ADULT_DEFAULT, 'add-adult'),
      addButton(`+ ילד (${cm(CHILD_DEFAULT)} ס״מ)`, CHILD_DEFAULT, 'add-child'),
    ]),
    el('p', {
      className: 'panel__hint', text: full ? `אפשר להוסיף עד ${MAX_PEOPLE} אנשים. כדי להוסיף, הסירו מישהו.` : '',
      attrs: { role: 'status', 'data-testid': 'household-limit' },
    }),
  ]);
  // The rest of the panel is in English; this section is Hebrew, right to left.
  container.lang = 'he';
  container.dir = 'rtl';
  return container;
}
