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
    attrs: { id, type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off', placeholder: 'Optional', 'data-testid': `person-name-${person.id}` },
  });
  input.value = person.name;
  input.addEventListener('change', () => onCommit(input.value));
  return el('div', { className: 'field' }, [el('label', { className: 'field__label', text: 'Name', attrs: { for: id } }), input]);
}

function personRow(person, index, design, update, remove) {
  const share = Math.round((person.height / design.dimensions.height) * 100);
  const title = person.name || `Person ${index + 1}`;
  return el('li', { className: 'person-row', attrs: { 'data-testid': `person-${person.id}` } }, [
    el('div', { className: 'person-row__head' }, [
      el('strong', { text: title }),
      el('span', { className: `person-row__tag${isChild(person) ? ' person-row__tag--child' : ''}`, text: isChild(person) ? 'Child' : 'Adult' }),
    ]),
    el('div', { className: 'field-row field-row--2' }, [
      nameField(person, (name) => update({ ...person, name })),
      cmField({
        label: 'Height',
        mm: person.height,
        testId: `person-height-${person.id}`,
        onCommit: (mm) => (validHeight(mm)
          ? update({ ...person, height: mm })
          : { ok: false, message: `Height must be ${cm(HEIGHT_RANGE[0])}–${cm(HEIGHT_RANGE[1])} cm` }),
      }),
    ]),
    el('p', { className: 'person-row__note', text: `${share}% of the wardrobe's height (${cm(design.dimensions.height)} cm)` }),
    button('Remove', remove, { variant: 'ghost', testId: `person-remove-${person.id}` }),
  ]);
}

function safetyAlert(design, safety) {
  const who = safety.count === 1 ? `A child of ${cm(safety.tallest)} cm lives here.` : `${safety.count} children live here (the tallest is ${cm(safety.tallest)} cm).`;
  const steps = safety.steps
    ? ` ${safety.steps === 1 ? '1 drawer starts' : `${safety.steps} drawers start`} below ${cm(safety.tallest)} cm and can be climbed like steps.`
    : '';
  const release = safety.releaseOnWall
    ? `mount its release button on the wall beside the wardrobe, at least ${cm(safety.releaseHeight)} cm high (the wardrobe is ${cm(design.dimensions.height)} cm)`
    : `put its release button at least ${cm(safety.releaseHeight)} cm high`;
  return el('aside', { className: 'safety-alert', attrs: { 'aria-label': 'Child safety', 'data-testid': 'child-safety' } }, [
    el('strong', { className: 'safety-alert__title', text: 'Child safety: climbing risk' }),
    el('p', { text: `${who} Children climb open drawers and doors, and a wardrobe that tips over is the main danger.${steps}` }),
    el('ul', { className: 'safety-alert__list' }, [
      el('li', { text: 'Anchor the wardrobe to the wall before use.' }),
      el('li', {
        attrs: { 'data-testid': 'child-lock-suggestion' },
        text: `Use a child safety lock on every ${safety.hasDoors ? 'door and drawer' : 'drawer'}, and ${release}, above a standing child's reach (estimate: 1.3 × height).`,
      }),
    ]),
    el('p', { className: 'safety-alert__note', text: 'A lock deters; it does not replace supervision. This is guidance for the carpenter, not a safety certification.' }),
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

  return section('Household', [
    el('p', { className: 'panel__hint', text: 'Who will use the wardrobe? Each person appears beside it in 3D at their height. Kept only in this browser.' }),
    ...(safety ? [safetyAlert(design, safety)] : []),
    el('ol', { className: 'person-list' }, household.map((p, i) => personRow(p, i, design, update, remove(p.id)))),
    el('div', { className: 'button-row button-row--pair' }, [
      button(`+ Adult (${cm(ADULT_DEFAULT)} cm)`, add(ADULT_DEFAULT), { testId: 'add-adult', disabled: full }),
      button(`+ Child (${cm(CHILD_DEFAULT)} cm)`, add(CHILD_DEFAULT), { testId: 'add-child', disabled: full }),
    ]),
  ]);
}
