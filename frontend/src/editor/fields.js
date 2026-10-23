// Small DOM builders for the properties panel. Text is always set via textContent or
// input.value, never innerHTML, so design data (e.g. custom names) cannot inject markup.
// Focusable controls without a data-testid carry a `data-key` (their label); panel.js
// combines it with the enclosing [data-section] / [data-group] to restore focus after a re-render.
import { createLiveCommit } from './liveSlider.js';
import { friendlyError, parseCm, toCmText } from './opsFromForm.js';
import { clampToRange, normalizeRange, pageStep } from './sliderRanges.js';
import { readSectionStates, writeSectionState } from './uiPrefs.js';

let fieldCounter = 0;
const nextId = (prefix) => `${prefix}-${(fieldCounter += 1)}`;

export function el(tag, { className, text, attrs = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  node.append(...children);
  return node;
}

/** A non-collapsible section (used for the Selected component). */
export function section(title, children) {
  return el('section', { className: 'prop-section' }, [el('h3', { className: 'prop-section__title', text: title }), ...children]);
}

/** A collapsible section; its open state is remembered per `key` in localStorage. */
export function collapsibleSection(key, title, children) {
  const open = readSectionStates()[key] !== false;
  const summary = el('summary', { attrs: { 'data-key': 'summary' } }, [el('h3', { className: 'prop-section__title', text: title })]);
  const details = el('details', { className: 'prop-section', attrs: { 'data-section': key } }, [summary, ...children]);
  details.open = open;
  details.addEventListener('toggle', () => {
    if (details.open !== (readSectionStates()[key] !== false)) writeSectionState(key, details.open);
  });
  return details;
}

/**
 * A labelled input + inline message. `commit(rawText)` returns { ok, error?, message? }.
 * Returns the field element and a small handle for code that drives the input programmatically
 * (the slider): `setText` replaces the text without committing it, `showError` / `clearError`
 * control the inline message.
 */
function createInput({ label, value, testId, suffix, commit, inputMode = 'decimal' }) {
  const id = nextId('field');
  const messageId = `${id}-msg`;
  const input = el('input', { className: 'field__input', attrs: { id, type: 'text', inputmode: inputMode, autocomplete: 'off', 'aria-describedby': messageId, 'data-key': label } });
  input.value = value;
  if (testId) input.dataset.testid = testId;
  const message = el('p', { className: 'field__message', attrs: { id: messageId, 'aria-live': 'polite' } });
  const showError = (text) => {
    message.textContent = text;
    input.setAttribute('aria-invalid', 'true');
  };
  const clearError = () => {
    input.removeAttribute('aria-invalid');
    message.textContent = '';
  };
  let lastSubmitted = value;
  const apply = () => {
    if (input.value === lastSubmitted) return;
    lastSubmitted = input.value;
    const result = commit(input.value);
    if (!result.ok) showError(result.message ?? friendlyError(result.error));
  };
  input.addEventListener('input', clearError);
  input.addEventListener('change', apply);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') apply();
  });
  const control = el('div', { className: 'field__control' }, [input, ...(suffix ? [el('span', { className: 'field__suffix', text: suffix })] : [])]);
  const field = el('div', { className: 'field' }, [el('label', { className: 'field__label', text: label, attrs: { for: id } }), control, message]);
  return {
    field,
    handle: {
      input,
      message,
      showError,
      clearError,
      setText(text) {
        input.value = text;
        lastSubmitted = text;
      },
    },
  };
}

const inputField = (options) => createInput(options).field;

/** Reflect a value on a slider: position, spoken value and the accent fill (`--slider-frac`). */
export function syncSlider(slider, mm, range) {
  const value = clampToRange(mm, range);
  slider.value = String(value);
  slider.setAttribute('aria-valuetext', `${toCmText(value)} ס״מ`);
  const span = range.max - range.min;
  slider.style.setProperty('--slider-frac', span > 0 ? String((value - range.min) / span) : '0');
}

/**
 * The slider of one cm field. Dragging updates the text immediately and commits the latest value
 * at most once per animation frame, so the 3D view follows the thumb; `change` (release, or a
 * key press) commits the final value. A value the domain rejects is not applied: the inline
 * error is shown, the text keeps the last accepted value, and the thumb snaps back on release.
 */
function createSlider({ label, testId, mm, range, text, onCommit }) {
  const slider = el('input', {
    className: 'field__slider',
    attrs: {
      type: 'range', min: String(range.min), max: String(range.max), step: String(range.step),
      'aria-label': `${label}, מחוון`, 'aria-describedby': text.input.getAttribute('aria-describedby'), 'data-key': `${label} slider`,
    },
  });
  if (testId) slider.dataset.testid = `${testId}-slider`;
  slider.disabled = range.max <= range.min;
  syncSlider(slider, mm, range);

  const live = createLiveCommit({
    initial: mm,
    commit: onCommit,
    onResult: (result) => {
      if (result.ok) {
        text.clearError();
        return;
      }
      text.setText(toCmText(live.value)); // the text always shows what the design really holds
      text.showError(result.message ?? friendlyError(result.error));
    },
  });

  const mmOf = () => Number(slider.value);
  slider.addEventListener('input', () => {
    syncSlider(slider, mmOf(), range);
    text.setText(toCmText(mmOf()));
    live.move(mmOf());
  });
  slider.addEventListener('change', () => {
    const outcome = live.release(mmOf());
    if (outcome.ok) return;
    syncSlider(slider, outcome.value, range); // snap back to the last accepted value
    text.setText(toCmText(outcome.value));
  });
  // PageUp / PageDown move by 10 cm (the browser default is a tenth of the whole range).
  slider.addEventListener('keydown', (event) => {
    if ((event.key !== 'PageUp' && event.key !== 'PageDown') || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = pageStep(mmOf(), event.key === 'PageUp' ? 1 : -1, range);
    if (next === mmOf()) return;
    slider.value = String(next);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return { slider, accept: (value) => { live.accept(value); syncSlider(slider, value, range); } };
}

/**
 * A centimetre field backed by an integer-millimetre value. `onCommit(mm)` dispatches and returns
 * the domain result. An `optional` field may be empty (`mm` null); clearing it commits null. With `range` ({ min, max, step } in mm) the field also gets a slider.
 * Returns the field and the slider separately so a caller can lay them out; `cmField` is the
 * common case with the slider directly under the text input.
 */
export function cmFieldParts({ label, mm, testId, onCommit, range = null, optional = false }) {
  const bounds = range && mm !== null ? normalizeRange(range) : null;
  let accept = null;
  const text = createInput({
    label, testId, suffix: 'ס״מ', value: mm === null ? '' : toCmText(mm),
    commit: (value) => {
      if (optional && value.trim() === '') return onCommit(null); // an empty optional field clears it
      const parsed = parseCm(value);
      if (!parsed.ok) return parsed;
      const result = onCommit(parsed.mm);
      if (result.ok) accept?.(parsed.mm);
      return result;
    },
  });
  if (!bounds) return { field: text.field, slider: null };
  const created = createSlider({ label, testId, mm, range: bounds, text: text.handle, onCommit });
  accept = created.accept;
  return { field: text.field, slider: created.slider };
}

/** A centimetre field; with `range` the slider sits directly under the text input. */
export function cmField(options) {
  const { field, slider } = cmFieldParts(options);
  if (slider) field.querySelector('.field__control').after(slider);
  return field;
}

/** A free-text field (names). `onCommit(text)` returns a result like the other fields. */
export function textField({ label, value, testId, onCommit }) {
  return inputField({ label, testId, value, inputMode: 'text', commit: (text) => onCommit(text) });
}

/** A whole-number field (counts). */
export function countField({ label, value, testId, onCommit }) {
  return inputField({
    label, testId, value: String(value), inputMode: 'numeric',
    commit: (text) => (/^\d{1,2}$/.test(text.trim()) ? onCommit(Number(text.trim())) : { ok: false, message: 'הזינו מספר שלם' }),
  });
}

export function segmented({ label, options, value, onChange, testId }) {
  const group = el('div', { className: 'segmented', attrs: { role: 'group', 'aria-label': label } });
  if (testId) group.dataset.testid = testId;
  options.forEach((option) => {
    const button = el('button', {
      className: 'segmented__option', text: option.label,
      attrs: { type: 'button', 'aria-pressed': String(option.value === value), 'data-key': `${label}/${option.label}` },
    });
    button.addEventListener('click', () => {
      if (option.value !== value) onChange(option.value);
    });
    group.append(button);
  });
  return el('div', { className: 'field' }, [el('span', { className: 'field__label', text: label }), group]);
}

export function selectField({ label, options, value, onChange, testId }) {
  const id = nextId('select');
  const select = el('select', { className: 'field__input', attrs: { id, 'data-key': label } }, options.map((option) => {
    const node = el('option', { text: option.label, attrs: { value: option.value } });
    node.selected = option.value === value;
    return node;
  }));
  if (testId) select.dataset.testid = testId;
  select.addEventListener('change', () => onChange(select.value));
  return el('div', { className: 'field' }, [el('label', { className: 'field__label', text: label, attrs: { for: id } }), select]);
}

/**
 * An iOS-style switch (a real checkbox). `onChange(checked)` returns the domain result; when the
 * change is rejected the switch goes back to its previous position.
 */
export function switchField({ label, checked, onChange, testId }) {
  const input = el('input', { attrs: { type: 'checkbox', 'data-key': label } });
  input.checked = checked;
  if (testId) input.dataset.testid = testId;
  input.addEventListener('change', () => {
    const result = onChange(input.checked);
    if (result && result.ok === false) input.checked = !input.checked;
  });
  return el('div', { className: 'field field--switch' }, [el('label', { className: 'switch' }, [input, el('span', { text: label })])]);
}

export function button(text, onClick, { variant = 'secondary', testId, disabled = false } = {}) {
  const node = el('button', { className: `btn btn--${variant}`, text, attrs: { type: 'button', 'data-key': text } });
  if (testId) node.dataset.testid = testId;
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}

/** Shows a domain error from a non-input action (buttons, selects) under a section. */
export function actionResult(container, result) {
  container.querySelectorAll(':scope > .action-error').forEach((node) => node.remove());
  if (!result.ok) container.append(el('p', { className: 'field__message action-error', text: friendlyError(result.error), attrs: { role: 'alert' } }));
  return result;
}
