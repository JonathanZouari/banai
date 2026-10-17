// Left column: header (with a Hebrew/English switch), a welcome with starter prompts, the
// conversation, the proposal card and the composer. This panel never changes the design by
// itself: the agent only proposes, and the host applies a proposal when the customer confirms it.
// Switching the language rebuilds the panel's chrome; the conversation and the draft stay.
// Voice: every designer reply can be read aloud (server voice, or the browser's own as a
// fallback), and with server voice the customer can dictate into the composer; dictated text is
// never sent until they press send.
import { transcribe as transcribeApi } from '../api/client.js';
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH } from './chatModel.js';
import { createLanguage, detectLanguage, LANGUAGES, STRINGS, stringsFor } from './i18n.js';
import { renderProposalCard } from './proposalCard.js';
import { canRecord, createRecorder, createSpeaker } from './voice.js';

const LANGUAGE_NAMES = Object.freeze({ he: 'עב', en: 'EN' });
const AUTO_SPEAK_KEY = 'banai.chat.autoSpeak';

function readAutoSpeak(storage) {
  try {
    return storage?.getItem(AUTO_SPEAK_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeAutoSpeak(storage, on) {
  try {
    storage?.setItem(AUTO_SPEAK_KEY, on ? 'on' : 'off');
  } catch {
    // not remembered; still applies for this visit
  }
}

function languageSwitch(language, t) {
  const group = el('div', { className: 'lang-switch', attrs: { role: 'group', 'aria-label': t.switchLabel } });
  group.dataset.testid = 'chat-language';
  LANGUAGES.forEach((code) => {
    const option = el('button', {
      className: 'lang-switch__option',
      text: LANGUAGE_NAMES[code],
      attrs: { type: 'button', lang: code, 'aria-pressed': String(code === language.get()), title: code === 'he' ? 'עברית' : 'English' },
    });
    option.dataset.testid = `chat-language-${code}`;
    option.addEventListener('click', () => language.set(code));
    group.append(option);
  });
  return group;
}

export function mountChat(container, {
  model,
  onConfirm,
  language = createLanguage(),
  voice = false, // the server has ElevenLabs configured
  speaker = createSpeaker({ serverVoice: voice }),
  recorder = voice && canRecord() ? createRecorder() : null,
  transcribe = transcribeApi,
  storage = globalThis.localStorage,
}) {
  container.classList.add('panel--chat');
  let draft = '';
  let hintKey = null; // a localized placeholder chosen on the start screen
  let view = null;
  let autoSpeak = readAutoSpeak(storage);
  let micState = 'idle'; // 'idle' | 'recording' | 'transcribing'
  let voiceNote = ''; // a localized status or error under the composer
  let seenCount = 0; // messages already shown once (so a rebuild never re-reads them)

  const updateSpeakButtons = (playing = speaker.playing()) => {
    view?.speakButtons.forEach((button, index) => {
      const on = playing === index;
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', on ? view.t.stopReading : view.t.readAloud);
      button.title = button.getAttribute('aria-label');
      button.replaceChildren(icon(on ? 'stop' : 'volume', { size: 16 }));
    });
  };
  speaker.subscribe(updateSpeakButtons);

  const updateMic = () => {
    if (!view) return;
    const { micButton, voiceStatus, t } = view;
    voiceStatus.textContent = micState === 'recording' ? t.listening : micState === 'transcribing' ? t.transcribing : voiceNote;
    voiceStatus.hidden = !voiceStatus.textContent;
    if (!micButton) return;
    const recording = micState === 'recording';
    micButton.classList.toggle('chat__mic--recording', recording);
    micButton.setAttribute('aria-pressed', String(recording));
    micButton.setAttribute('aria-label', recording ? t.micStop : t.micStart);
    micButton.disabled = micState === 'transcribing';
    micButton.replaceChildren(icon(recording ? 'stop' : 'mic', { size: 20 }));
  };

  async function finishRecording() {
    if (micState !== 'recording') return;
    micState = 'transcribing';
    updateMic();
    const blob = await recorder.stop();
    try {
      const text = blob ? (await transcribe(blob, language.get())).text : '';
      voiceNote = text ? '' : view.t.micError;
      if (text) {
        // Into the composer, never sent: the customer checks it and presses send.
        draft = draft.trim() ? `${draft.trim()} ${text}` : text;
        view.input.value = draft;
        view.input.focus();
      }
    } catch {
      voiceNote = view.t.micError;
    }
    micState = 'idle';
    updateMic();
  }

  async function toggleMic() {
    if (micState === 'recording') return finishRecording();
    if (micState !== 'idle') return undefined;
    speaker.stop(); // do not record the designer's own voice
    voiceNote = '';
    try {
      await recorder.start();
    } catch {
      voiceNote = view.t.micDenied;
      updateMic();
      return undefined;
    }
    micState = 'recording';
    updateMic();
    recorder.whenStopped().then(() => finishRecording()); // the time limit stops it too
    return undefined;
  }

  function build() {
    const t = language.strings();
    container.setAttribute('dir', t.dir);
    container.setAttribute('lang', language.get());

    const header = el('header', { className: 'chat__header' }, [
      el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
      el('div', { className: 'chat__heading' }, [
        el('h2', { className: 'chat__title', text: t.title }),
        el('p', { className: 'chat__subtitle', text: t.subtitle }),
      ]),
      model.isConnected()
        ? el('span', { className: 'chat__status chat__status--online', text: t.online, attrs: { title: t.onlineTitle } })
        : el('span', { className: 'chat__status', text: t.comingSoon, attrs: { title: t.comingSoonTitle } }),
    ]);
    const autoSpeakButton = el('button', {
      className: 'chat__auto-speak',
      attrs: { type: 'button', 'aria-pressed': String(autoSpeak), title: t.autoSpeakTitle },
    }, [icon('volume', { size: 16 }), el('span', { text: t.autoSpeak })]);
    autoSpeakButton.dataset.testid = 'chat-auto-speak';
    autoSpeakButton.addEventListener('click', () => {
      autoSpeak = !autoSpeak;
      writeAutoSpeak(storage, autoSpeak);
      autoSpeakButton.setAttribute('aria-pressed', String(autoSpeak));
      if (!autoSpeak) speaker.stop();
    });
    if (model.isConnected()) header.append(autoSpeakButton);

    const input = el('textarea', { className: 'chat__input', attrs: { rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: (hintKey && t.composerHints[hintKey]) || t.placeholder, dir: 'auto', 'aria-label': t.inputLabel } });
    input.dataset.testid = 'chat-input';
    input.value = draft;
    input.addEventListener('input', () => { draft = input.value; });
    const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit', 'aria-label': t.send } }, [icon('send')]);
    sendButton.dataset.testid = 'chat-send';
    let micButton = null;
    if (recorder && model.isConnected()) {
      micButton = el('button', { className: 'icon-btn chat__mic', attrs: { type: 'button', title: t.micTitle } });
      micButton.dataset.testid = 'chat-mic';
      micButton.addEventListener('click', toggleMic);
    }
    const composer = el('form', { className: 'chat__composer' }, [input, ...(micButton ? [micButton] : []), sendButton]);
    const hint = el('p', { className: 'chat__hint', text: t.hint });
    const voiceStatus = el('p', { className: 'chat__voice-status', attrs: { role: 'status' } });
    voiceStatus.dataset.testid = 'chat-voice-status';

    const chips = t.suggestions.map((text) => {
      const chip = el('button', { className: 'suggestion', attrs: { type: 'button' } }, [icon('sparkle', { size: 16 }), el('span', { text })]);
      chip.dataset.testid = 'suggestion';
      chip.addEventListener('click', () => {
        input.value = text; // only fills the composer: nothing is sent until the customer presses send
        draft = text;
        input.focus();
      });
      return chip;
    });
    const welcome = el('section', { className: 'welcome', attrs: { 'aria-label': t.welcomeLabel } }, [
      el('h3', { className: 'welcome__title', text: t.welcomeTitle }),
      el('p', { className: 'welcome__text', text: t.welcomeText }),
      el('div', { className: 'welcome__chips' }, chips),
    ]);
    welcome.dataset.testid = 'chat-welcome';

    const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': t.conversation } });
    list.dataset.testid = 'chat-messages';
    const proposalSlot = el('div', { className: 'chat__proposal' });
    const typing = el('div', { className: 'chat__bubble chat__bubble--assistant chat__typing', attrs: { role: 'status', 'aria-label': t.thinking } }, [
      el('span', { className: 'chat__dot' }), el('span', { className: 'chat__dot' }), el('span', { className: 'chat__dot' }),
    ]);
    typing.dataset.testid = 'chat-typing';
    typing.hidden = true;

    const submit = () => {
      if (model.isBusy() || !input.value.trim()) return;
      // Writing in Hebrew or English switches the chat to that language first, so the reply (and
      // the UI) come back only in the language the customer wrote in.
      const written = detectLanguage(input.value);
      if (written && written !== language.get()) {
        draft = input.value;
        language.set(written); // rebuilds the panel; the draft is carried over
        view.submit();
        return;
      }
      if (model.send(input.value).ok) {
        input.value = '';
        draft = '';
      }
    };
    composer.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    const footerRow = el('div', { className: 'chat__footer-row' }, [hint, languageSwitch(language, t)]);
    container.replaceChildren(header, el('div', { className: 'chat__body' }, [welcome, list, proposalSlot]), el('div', { className: 'chat__footer' }, [composer, voiceStatus, footerRow]));
    view = {
      t, input, sendButton, composer, welcome, list, proposalSlot, typing, submit, micButton, voiceStatus,
      speakButtons: new Map(), renderedCount: 0, renderedProposalKey: null,
    };
    updateMic();
  }

  function speakButton(index, message) {
    const button = el('button', { className: 'icon-btn chat__speak', attrs: { type: 'button' } });
    button.dataset.testid = 'chat-speak';
    button.addEventListener('click', () => {
      if (speaker.playing() === index) speaker.stop();
      else speaker.speak(index, message.text, message.language ?? language.get());
    });
    view.speakButtons.set(index, button);
    return button;
  }

  function render() {
    const { t, sendButton, composer, welcome, list, proposalSlot, typing } = view;
    const messages = model.getMessages();
    welcome.hidden = messages.length > 0 || model.getProposal() !== null;
    list.hidden = messages.length === 0;
    // Only newly added bubbles are created (and animate in); existing ones stay untouched.
    if (messages.length < view.renderedCount) {
      list.replaceChildren();
      view.speakButtons.clear();
      view.renderedCount = 0;
    }
    messages.slice(view.renderedCount).forEach((message, offset) => {
      const index = view.renderedCount + offset;
      // Designer and system bubbles keep the language (and direction) they were written in; the
      // customer's own text takes its direction from its content. Switching language changes neither.
      const written = message.role !== 'user' && STRINGS[message.language];
      const bubble = el('div', {
        className: `chat__bubble chat__bubble--${message.role}`,
        attrs: written ? { dir: written.dir, lang: message.language } : { dir: 'auto' },
      });
      if (message.role === 'system') bubble.append(icon('info', { size: 16 }));
      bubble.append(el('span', { text: message.text }));
      if (message.role === 'assistant') {
        bubble.append(speakButton(index, message));
        // Only replies that just arrived, never ones redrawn after a language switch.
        if (autoSpeak && index >= seenCount) speaker.speak(index, message.text, message.language ?? language.get());
      }
      list.append(bubble);
    });
    view.renderedCount = messages.length;
    seenCount = Math.max(seenCount, messages.length);
    updateSpeakButtons();
    const busy = model.isBusy();
    typing.hidden = !busy;
    if (busy) list.append(typing); // keep the indicator last, under the newest message
    sendButton.disabled = busy;
    composer.setAttribute('aria-busy', String(busy));
    list.scrollTop = list.scrollHeight;

    // Re-render the card only when the proposal or its status changed (keeps its entrance animation calm).
    const proposal = model.getProposal();
    const status = model.getProposalStatus();
    const key = proposal ? `${proposal.id}:${status}` : '';
    if (key === view.renderedProposalKey) return;
    view.renderedProposalKey = key;
    proposalSlot.replaceChildren();
    if (proposal) {
      proposalSlot.append(renderProposalCard(proposal, status, {
        onConfirm,
        onCancel: () => model.cancelProposal(),
        strings: proposal.language ? stringsFor(proposal.language) : t, // the card stays in its own language
      }));
    }
  }

  build();
  model.subscribe(render);
  render();
  language.subscribe(() => {
    const hadFocus = document.activeElement === view.input;
    build();
    render();
    if (hadFocus) view.input.focus();
  });

  return {
    /** Focus the composer. `hintKey` picks a localized placeholder ('guided' | 'freeText'). */
    focus: (key) => {
      hintKey = key ?? null;
      view.input.placeholder = (hintKey && view.t.composerHints[hintKey]) || view.t.placeholder;
      view.input.focus();
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}
