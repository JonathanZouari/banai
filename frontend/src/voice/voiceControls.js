// Voice controls for the chat composer: a microphone button (press to record, press again to send), a
// "read replies aloud" toggle and a status line. All text is set with textContent.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';

export function createVoiceControls(model) {
  const mic = el('button', { className: 'icon-btn chat__mic', attrs: { type: 'button', 'aria-label': 'Speak your request', 'aria-pressed': 'false' } }, [icon('mic')]);
  mic.dataset.testid = 'voice-mic';
  mic.addEventListener('click', () => model.toggleRecording());

  const speakToggle = el('button', { className: 'chip-toggle', attrs: { type: 'button', role: 'switch', 'aria-checked': 'false' } }, [
    icon('volume', { size: 16 }),
    el('span', { text: 'Read replies aloud' }),
  ]);
  speakToggle.dataset.testid = 'voice-speak-toggle';
  speakToggle.addEventListener('click', () => model.setSpeakReplies(speakToggle.getAttribute('aria-checked') !== 'true'));

  const status = el('p', { className: 'chat__voice-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  status.dataset.testid = 'voice-status';
  const privacy = el('p', { className: 'chat__voice-note', text: 'Recordings and read-aloud text are sent to OpenAI.' });

  function render() {
    const { state, speaking, notice, speakReplies } = model.getState();
    const recording = state === 'recording';
    const busy = state === 'transcribing';
    mic.setAttribute('aria-pressed', String(recording));
    mic.setAttribute('aria-label', recording ? 'Stop and send' : 'Speak your request');
    mic.classList.toggle('chat__mic--recording', recording);
    mic.disabled = busy;
    mic.replaceChildren(icon(recording ? 'stop' : 'mic'));
    speakToggle.setAttribute('aria-checked', String(speakReplies));
    status.textContent = recording ? 'Listening… press again to send'
      : busy ? 'Transcribing…'
        : speaking ? 'Speaking…'
          : notice;
    status.classList.toggle('chat__voice-status--error', Boolean(notice) && !recording && !busy && !speaking);
  }
  model.subscribe(render);
  render();

  return { mic, row: el('div', { className: 'chat__voice' }, [speakToggle, status]), privacy };
}
