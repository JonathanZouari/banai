// "פרטי לקוח" (ADR-038): the customer's details for the carpenter's dossier, kept with the project in this browser
// (share/customer.js). The agent never sees them. A clear dialog with labelled fields; nothing is sent anywhere
// until the customer downloads a dossier.
import { button, el } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { TEXT_FIELDS, YEARS, checkCustomer } from './customer.js';

/**
 * @param getCustomer () => the current project's details, or null
 * @param setCustomer (details | null) => void
 * @param toast       (text) => void
 */
export function createCustomerDialog({ getCustomer, setCustomer, toast }) {
  const inputs = {};
  const field = (key, label, control, hint = null) => {
    control.id = `customer-${key}`;
    control.dataset.testid = `customer-${key}`;
    inputs[key] = control;
    return el('div', { className: 'field' }, [
      el('label', { className: 'field__label', text: label, attrs: { for: control.id } }),
      control,
      ...(hint ? [el('p', { className: 'field__hint', text: hint })] : []),
    ]);
  };
  const textFields = TEXT_FIELDS.map(({ key, label, max, autocomplete, inputMode, dir, multiline }) => {
    const attrs = { maxlength: String(max), autocomplete: autocomplete ?? 'off', ...(inputMode ? { inputmode: inputMode } : {}), ...(dir ? { dir } : {}) };
    const control = multiline
      ? el('textarea', { className: 'field__input customer__notes', attrs: { ...attrs, rows: '3' } })
      : el('input', { className: 'field__input', attrs: { type: 'text', ...attrs } });
    return field(key, label, control);
  });
  const floor = field('floor', 'קומה', el('input', { className: 'field__input', attrs: { type: 'number', min: '-5', max: '150', step: '1', inputmode: 'numeric' } }));
  const elevatorSelect = el('select', { className: 'field__input' }, [
    el('option', { text: 'לא ידוע', attrs: { value: '' } }),
    el('option', { text: 'יש מעלית', attrs: { value: 'yes' } }),
    el('option', { text: 'אין מעלית', attrs: { value: 'no' } }),
  ]);
  const elevator = field('elevator', 'מעלית', elevatorSelect, 'חשוב לנגר: איך מעלים את הלוחות והגוף.');
  const installDate = field('installDate', 'מועד התקנה רצוי', el('input', { className: 'field__input', attrs: { type: 'date', min: `${YEARS[0]}-01-01`, max: `${YEARS[1]}-12-31` } }));
  const error = el('p', { className: 'dialog__status customer__error', attrs: { role: 'alert' } });
  error.dataset.testid = 'customer-error';

  const fill = (customer) => {
    const c = customer ?? {};
    TEXT_FIELDS.forEach(({ key }) => { inputs[key].value = c[key] ?? ''; });
    inputs.floor.value = c.floor ?? '';
    inputs.elevator.value = c.elevator === true ? 'yes' : c.elevator === false ? 'no' : '';
    inputs.installDate.value = c.installDate ?? '';
    error.textContent = '';
  };
  const read = () => ({
    ...Object.fromEntries(TEXT_FIELDS.map(({ key }) => [key, inputs[key].value])),
    floor: inputs.floor.value,
    elevator: { yes: true, no: false }[inputs.elevator.value] ?? null,
    installDate: inputs.installDate.value,
  });

  const save = () => {
    const checked = checkCustomer(read());
    if (!checked.ok) {
      error.textContent = checked.message;
      inputs[checked.field]?.focus();
      return;
    }
    setCustomer(checked.customer);
    dialog.close();
    toast?.(checked.customer ? 'פרטי הלקוח עודכנו. הם יישמרו עם הפרויקט.' : 'פרטי הלקוח נמחקו מהפרויקט.');
  };

  const dialog = createDialog({
    title: 'פרטי לקוח',
    labelId: 'customer-dialog-title',
    testId: 'customer-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'לתיק הנגר: איך להשיג אתכם ולאן להגיע. הפרטים נשמרים עם הפרויקט בדפדפן הזה בלבד, ומודפסים רק בתיק הנגר. בוב לא רואה אותם. כל השדות רשות.' }),
      el('div', { className: 'customer-grid' }, [...textFields.slice(0, 5), floor, elevator, installDate, ...textFields.slice(5)]),
      error,
    ],
    actions: [
      button('שמירה', save, { variant: 'primary', testId: 'customer-save' }),
      button('מחיקת הפרטים', () => { fill(null); }, { variant: 'ghost', testId: 'customer-clear' }),
      button('ביטול', () => dialog.close(), { variant: 'ghost', testId: 'customer-cancel' }),
    ],
  });

  return {
    open() {
      fill(getCustomer());
      dialog.open();
      inputs.name.focus();
    },
  };
}
