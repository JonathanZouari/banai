// Homepage: a minimal, search-like first screen (Stitch "BanAI - דף הבית"). One central AI field
// with "Design my wardrobe", a manual-dimensions button and a basic-wardrobe link. It overlays the
// workspace (which stays rendered and sized underneath, but inert) and re-renders on a language
// change without losing what the customer typed. All text is set with textContent.
import { el } from '../editor/fields.js';
import { MAX_MESSAGE_LENGTH } from '../chat/chatModel.js';
import { startRecording } from '../chat/voice.js';
import { t } from '../ui/i18n.js';
import { icon } from '../ui/icons.js';
import { createLanguageSwitch } from '../ui/languageSwitch.js';
import { createLogo } from '../ui/logo.js';
import { promptIntent } from './homeIntent.js';

/**
 * language: the UI language object. agentConnected: whether the AI designer is available (an honest
 * note is shown otherwise). voice: { ready, transcribe(blob) } or null. Handlers receive the intent:
 * onPrompt({ kind: 'message', text } | { kind: 'guided' }), onManual(), onBasic().
 */
export function mountHome({ language, agentConnected, voice = null, onPrompt, onManual, onBasic }) {
  let draft = '';
  let canContinue = false;
  let voiceState = { recording: null, status: null, notice: null }; // status: null | 'recording' | 'transcribing'
  let view = null;

  const root = el('div', { className: 'home', attrs: { role: 'region', 'aria-labelledby': 'home-title' } });
  root.dataset.testid = 'home';
  root.hidden = true;

  function showVoice() {
    const s = t().home;
    view.voiceNote.textContent = voiceState.notice ?? (voiceState.status ? s[voiceState.status] : '');
    if (!view.mic) return;
    const recording = voiceState.status === 'recording';
    view.mic.classList.toggle('home__mic--recording', recording);
    view.mic.setAttribute('aria-pressed', String(recording));
    view.mic.setAttribute('aria-label', recording ? s.micStop : s.mic);
    view.mic.replaceChildren(icon(recording ? 'stop' : 'mic'));
    view.mic.disabled = voiceState.status === 'transcribing';
  }

  async function toggleMic() {
    if (voiceState.recording) {
      voiceState.recording.stop();
      return;
    }
    voiceState.notice = null;
    try {
      voiceState.recording = await startRecording();
    } catch {
      voiceState = { recording: null, status: null, notice: t().home.micDenied };
      showVoice();
      return;
    }
    voiceState.status = 'recording';
    showVoice();
    const blob = await voiceState.recording.done;
    voiceState.recording = null;
    voiceState.status = 'transcribing';
    showVoice();
    try {
      const { text } = await voice.transcribe(blob);
      draft = text; // fills the field only; the customer reviews it and presses the button
      view.input.value = text;
      view.input.focus();
    } catch (error) {
      voiceState.notice = error?.status ? error.message : t().home.voiceError;
    } finally {
      voiceState.status = null;
      showVoice();
    }
  }

  function build() {
    const s = t().home;
    const input = el('input', {
      className: 'home__input',
      attrs: { id: 'home-prompt', type: 'text', dir: 'auto', autocomplete: 'off', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: s.placeholder, 'aria-label': s.promptLabel },
    });
    input.dataset.testid = 'home-prompt';
    input.value = draft;
    input.addEventListener('input', () => { draft = input.value; });

    const mic = voice?.ready ? el('button', { className: 'home__mic', attrs: { type: 'button' } }) : null;
    if (mic) {
      mic.dataset.testid = 'home-mic';
      mic.addEventListener('click', toggleMic);
    }
    const field = el('div', { className: 'home__field' }, [
      el('span', { className: 'home__sparkle', attrs: { 'aria-hidden': 'true' } }, [icon('sparkle', { size: 22 })]),
      input,
      ...(mic ? [mic] : []),
    ]);

    const design = el('button', { className: 'btn btn--primary home__primary', attrs: { type: 'submit' } }, [
      document.createTextNode(`${s.design} `), icon('arrow', { size: 18 }),
    ]);
    design.dataset.testid = 'home-design';
    const manual = el('button', { className: 'btn home__secondary', text: s.manual, attrs: { type: 'button' } });
    manual.dataset.testid = 'home-manual';
    manual.addEventListener('click', () => onManual());

    const form = el('form', { className: 'home__form', attrs: { 'aria-label': s.promptLabel } }, [
      field,
      el('div', { className: 'home__actions' }, [design, manual]),
    ]);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const intent = promptIntent(input.value);
      if (intent.kind === 'message') {
        draft = ''; // sent: coming back to the homepage must not offer to send it again
        input.value = '';
      }
      onPrompt(intent);
    });

    const basic = el('button', { className: 'home__link', text: canContinue ? s.continueDesign : s.basic, attrs: { type: 'button' } });
    basic.dataset.testid = 'entry-basic';
    basic.addEventListener('click', () => onBasic());

    const chips = s.suggestions.map((text) => {
      const chip = el('button', { className: 'home__chip', text, attrs: { type: 'button' } });
      chip.dataset.testid = 'home-suggestion';
      chip.addEventListener('click', () => {
        draft = text; // fills the field only: nothing is sent until the customer presses the button
        input.value = text;
        input.focus();
      });
      return chip;
    });

    const voiceNote = el('p', { className: 'home__note', attrs: { 'aria-live': 'polite' } });
    voiceNote.dataset.testid = 'home-voice-note';

    root.replaceChildren(
      el('header', { className: 'home__bar' }, [
        createLogo({ size: 36 }),
        el('div', { className: 'home__bar-actions' }, [
          createLanguageSwitch(language, { testId: 'home-language' }),
          el('a', { className: 'home__a11y', text: s.a11yLink, attrs: { href: '/accessibility.html' } }),
        ]),
      ]),
      el('section', { className: 'home__main' }, [
        el('h1', { className: 'home__title', text: s.title, attrs: { id: 'home-title' } }),
        el('p', { className: 'home__subtitle', text: s.subtitle }),
        form,
        voiceNote,
        ...(agentConnected ? [] : [el('p', { className: 'home__note home__note--offline', text: s.offline, attrs: { 'data-testid': 'home-offline' } })]),
        basic,
        el('div', { className: 'home__suggestions' }, [
          el('p', { className: 'home__suggestions-label', text: s.suggestionsLabel }),
          el('div', { className: 'home__chips' }, chips),
        ]),
      ]),
      el('footer', { className: 'home__footer' }, [el('p', { text: s.footnote })]),
    );
    view = { input, mic, voiceNote };
    showVoice();
  }

  language.subscribe(() => {
    const hadFocus = root.contains(document.activeElement) ? document.activeElement.dataset.testid : null;
    build();
    if (hadFocus) root.querySelector(`[data-testid="${CSS.escape(hadFocus)}"]`)?.focus();
  });
  build();
  document.body.append(root);

  return {
    element: root,
    /** Show the homepage. `canContinue`: a design is already in progress (offer to continue it). */
    show({ canContinue: next = false } = {}) {
      canContinue = next;
      build();
      root.hidden = false;
      document.body.classList.add('is-home');
      root.scrollTop = 0; // always open at the top, with the bar visible, even on a short window
      view.input.focus({ preventScroll: true });
    },
    hide() {
      voiceState.recording?.stop();
      root.hidden = true;
      document.body.classList.remove('is-home');
    },
  };
}
