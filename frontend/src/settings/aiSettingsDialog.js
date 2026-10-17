// "AI settings" dialog: enter, check, re-check or remove the OpenAI key. The key is kept only
// in this browser; the field is cleared after saving so the key never stays in the page.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { STATUS_DETAILS, STATUS_LABELS } from './aiSettingsModel.js';

const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export function createAiSettingsDialog(model) {
  const badge = el('span', { className: 'status-chip' });
  badge.dataset.testid = 'ai-settings-status';
  const detail = el('p', { className: 'dialog__text' });
  const meta = el('p', { className: 'dialog__note' });
  meta.dataset.testid = 'ai-settings-key';

  const input = el('input', {
    className: 'field__input field__input--key',
    attrs: { id: 'openai-key', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-...', 'aria-describedby': 'openai-key-message' },
  });
  input.dataset.testid = 'ai-key-input';
  const reveal = button('הצג', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    reveal.textContent = hidden ? 'הסתר' : 'הצג';
  }, { variant: 'ghost', testId: 'ai-key-reveal' });
  const message = el('p', { className: 'field__message', attrs: { id: 'openai-key-message', role: 'alert', 'aria-live': 'polite' } });

  const save = button('שמירה ובדיקה', async () => {
    const result = await model.saveKey(input.value);
    if (result.ok) {
      input.value = '';
      input.type = 'password';
      reveal.textContent = 'הצג';
    }
  }, { variant: 'primary', testId: 'ai-key-save' });
  const test = button('בדיקת חיבור', () => model.test(), { variant: 'secondary', testId: 'ai-key-test' });
  const remove = button('הסרת המפתח', () => model.removeKey(), { variant: 'ghost', testId: 'ai-key-remove' });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save.click();
  });

  const dialog = createDialog({
    title: 'הגדרות AI',
    labelId: 'ai-settings-title',
    testId: 'ai-settings-dialog',
    body: [
      el('div', { className: 'ai-settings__status' }, [badge, detail]),
      meta,
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: 'מפתח OpenAI API', attrs: { for: 'openai-key' } }),
        el('div', { className: 'field__control field__control--key' }, [input, reveal]),
        message,
      ]),
      el('p', { className: 'dialog__note', text: 'נשמר רק בדפדפן הזה, במחשב הזה. השרת של בנאי בודק את המפתח מול OpenAI ולא שומר אותו.' }),
    ],
    actions: [remove, test, save, button('סגירה', () => dialog.close(), { variant: 'ghost', testId: 'ai-settings-close' })],
  });

  function render(state) {
    badge.textContent = STATUS_LABELS[state.status];
    badge.dataset.status = state.status;
    detail.textContent = STATUS_DETAILS[state.status];
    const parts = state.maskedKey ? [`מפתח ${state.maskedKey}`] : [];
    if (state.model) parts.push(`model ${state.model}`);
    if (state.checkedAt) parts.push(`checked ${formatTime(state.checkedAt)}`);
    meta.textContent = parts.join(' · ');
    meta.hidden = parts.length === 0;
    message.textContent = state.error ?? '';
    input.setAttribute('aria-invalid', state.error ? 'true' : 'false');
    save.disabled = state.busy;
    test.disabled = state.busy || !state.maskedKey;
    remove.hidden = !state.maskedKey;
  }
  model.subscribe(render);
  render(model.getState());

  return {
    ...dialog,
    open: () => {
      dialog.open();
      input.focus();
    },
  };
}
