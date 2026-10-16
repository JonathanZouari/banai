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
  const reveal = button('Show', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    reveal.textContent = hidden ? 'Hide' : 'Show';
  }, { variant: 'ghost', testId: 'ai-key-reveal' });
  const message = el('p', { className: 'field__message', attrs: { id: 'openai-key-message', role: 'alert', 'aria-live': 'polite' } });

  const save = button('Save & test', async () => {
    const result = await model.saveKey(input.value);
    if (result.ok) {
      input.value = '';
      input.type = 'password';
      reveal.textContent = 'Show';
    }
  }, { variant: 'primary', testId: 'ai-key-save' });
  const test = button('Test connection', () => model.test(), { variant: 'secondary', testId: 'ai-key-test' });
  const remove = button('Remove key', () => model.removeKey(), { variant: 'ghost', testId: 'ai-key-remove' });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save.click();
  });

  const dialog = createDialog({
    title: 'AI settings',
    labelId: 'ai-settings-title',
    testId: 'ai-settings-dialog',
    body: [
      el('div', { className: 'ai-settings__status' }, [badge, detail]),
      meta,
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: 'OpenAI API key', attrs: { for: 'openai-key' } }),
        el('div', { className: 'field__control field__control--key' }, [input, reveal]),
        message,
      ]),
      el('p', { className: 'dialog__note', text: 'Saved only in this browser on this computer. The BanAI server checks the key with OpenAI and does not store it.' }),
    ],
    actions: [remove, test, save, button('Close', () => dialog.close(), { variant: 'ghost', testId: 'ai-settings-close' })],
  });

  function render(state) {
    badge.textContent = STATUS_LABELS[state.status];
    badge.dataset.status = state.status;
    detail.textContent = STATUS_DETAILS[state.status];
    const parts = state.maskedKey ? [`Key ${state.maskedKey}`] : [];
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
