// "AI settings" dialog: enter, check, re-check or remove the OpenAI key. The key is kept only
// in this browser; the field is cleared after saving so the key never stays in the page.
import { el, button } from '../editor/fields.js';
import { createDialog } from '../ui/dialog.js';
import { STATUS_DETAILS, STATUS_LABELS } from './aiSettingsModel.js';
import { AI_VOICE_DISCLOSURE, RECOMMENDED_VOICES, SAMPLE_TEXT, VOICES } from '../chat/speech.js';

const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

const voiceLabel = (name) => `${name[0].toUpperCase()}${name.slice(1)}${RECOMMENDED_VOICES.includes(name) ? ' · מומלץ' : ''}`;

/**
 * `speech` (optional, ADR-028): { prefs, speaker }. Adds the reply voice picker with a sample, so the
 * customer chooses the voice by ear.
 */
export function createAiSettingsDialog(model, { speech = null } = {}) {
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

  let voiceSection = [];
  let preview = null;
  if (speech) {
    const voiceSelect = el('select', { className: 'field__input', attrs: { id: 'reply-voice' } }, VOICES.map((name) => {
      const option = el('option', { text: voiceLabel(name), attrs: { value: name } });
      option.selected = name === speech.prefs.getVoice();
      return option;
    }));
    voiceSelect.dataset.testid = 'ai-voice-select';
    voiceSelect.addEventListener('change', () => speech.prefs.setVoice(voiceSelect.value));
    preview = button('השמע דוגמה', () => speech.speaker.speak(SAMPLE_TEXT, voiceSelect.value), { variant: 'secondary', testId: 'ai-voice-preview' });
    voiceSection = [
      el('div', { className: 'field' }, [
        el('label', { className: 'field__label', text: 'קול התשובות', attrs: { for: 'reply-voice' } }),
        el('div', { className: 'field__control field__control--key' }, [voiceSelect, preview]),
      ]),
      el('p', { className: 'dialog__note', text: `כשמדברים לבנאי, הוא עונה גם בקול: ${AI_VOICE_DISCLOSURE} של OpenAI, צעיר ומחייך. אפשר להשתיק בלחצן הרמקול בשיחה.` }),
    ];
  }

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
      ...voiceSection,
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
    // The sample is made with the customer's key, one at a time (repeat clicks would each be paid for).
    if (preview) preview.disabled = !state.maskedKey || speech.speaker.getState() !== 'idle';
  }
  model.subscribe(render);
  speech?.speaker.subscribe(() => render(model.getState()));
  render(model.getState());

  return {
    ...dialog,
    open: () => {
      dialog.open();
      input.focus();
    },
  };
}
