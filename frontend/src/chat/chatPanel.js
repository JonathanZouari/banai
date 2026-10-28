// Left column: header, a welcome with starter prompts, the conversation, the proposal card and
// the composer. This panel never changes the design by itself: the agent only proposes, and the host
// applies a proposal when the customer confirms it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH } from './chatModel.js';
import { DIRECTIONS, detectLanguage, translate, voiceErrorMessage } from '../i18n/strings.js';
import { renderProposalCard } from './proposalCard.js';

/** onStyleProfile() opens the carpenter PDF dialog (Generate Style Profile); without it no note is shown. */
export function mountChat(container, {
  model, onConfirm, connected = false, language = null, voice = null, onStyleProfile = null,
}) {
  container.classList.add('panel--chat');
  const t = (key) => (language ? language.t(key) : translate('en', key));

  const title = el('h2', { className: 'chat__title' });
  const subtitle = el('p', { className: 'chat__subtitle' });
  const status = el('span', { className: 'chat__status' });
  // The Voice switch: when on, the microphone appears and every reply is read aloud.
  const voiceSwitchLabel = el('span', { className: 'chat__voice-toggle-label' });
  const voiceSwitchState = el('span', { className: 'chat__voice-toggle-state' });
  const voiceSwitch = el('button', { className: 'chat__voice-toggle', attrs: { type: 'button', role: 'switch', 'aria-checked': 'false' } }, [icon('volume', { size: 18 }), voiceSwitchLabel, voiceSwitchState]);
  voiceSwitch.dataset.testid = 'voice-toggle';
  const header = el('header', { className: 'chat__header' }, [
    el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
    el('div', { className: 'chat__heading' }, [
      title,
      subtitle,
    ]),
    status,
  ]);

  const input = el('textarea', { className: 'chat__input', attrs: { rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), dir: 'auto' } });
  input.dataset.testid = 'chat-input';
  const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit' } }, [icon('send')]);
  sendButton.dataset.testid = 'chat-send';
  const micButton = el('button', { className: 'icon-btn chat__mic', attrs: { type: 'button', 'aria-pressed': 'false' } }, [icon('mic')]);
  micButton.dataset.testid = 'voice-mic';
  micButton.hidden = true; // shown only while the Voice switch is on
  const composer = el('form', { className: 'chat__composer' }, voice ? [input, micButton, sendButton] : [input, sendButton]);
  const voiceStatus = el('p', { className: 'chat__voice-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  voiceStatus.dataset.testid = 'voice-status';
  voiceStatus.hidden = true;
  // Its own row above the composer (the header has no room for it): the switch on one side, what voice is doing next to it.
  const voiceRow = el('div', { className: 'chat__voice-row' }, [voiceSwitch, voiceStatus]);
  const hint = el('p', { className: 'chat__hint' });
  const voiceNote = el('p', { className: 'chat__hint chat__voice-note' });

  const makeChip = (text) => {
    const chip = el('button', { className: 'suggestion', attrs: { type: 'button' } }, [icon('sparkle', { size: 16 }), el('span', { text })]);
    chip.dataset.testid = 'suggestion';
    chip.addEventListener('click', () => {
      input.value = text; // only fills the composer: nothing is sent until the customer presses send
      input.focus();
    });
    return chip;
  };
  const welcomeTitle = el('h3', { className: 'welcome__title' });
  const welcomeText = el('p', { className: 'welcome__text' });
  const chipsBox = el('div', { className: 'welcome__chips' });
  const welcome = el('section', { className: 'welcome' }, [welcomeTitle, welcomeText, chipsBox]);
  welcome.dataset.testid = 'chat-welcome';

  const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite' } });
  list.dataset.testid = 'chat-messages';
  const proposalSlot = el('div', { className: 'chat__proposal' });
  const builtSlot = el('div', { className: 'chat__built-slot' });
  let renderedBuiltKey = '';
  let hintKey = null; // a localized placeholder chosen on the start screen
  const typing = el('div', { className: 'chat__bubble chat__bubble--assistant chat__typing', attrs: { role: 'status' } });
  typing.dataset.testid = 'chat-typing';
  typing.hidden = true;

  const submit = () => {
    if (model.isBusy() || !input.value.trim()) return;
    // Writing in Hebrew or English switches the app to that language first, so the reply (and the
    // UI) come back in the language the customer wrote in. Messages without letters keep the switch.
    const written = detectLanguage(input.value);
    if (language && written && written !== language.get()) language.set(written);
    if (model.send(input.value).ok) input.value = '';
    sendButton.disabled = model.isBusy();
  };

  /** The final step: one pinned note with Generate Style Profile (the carpenter PDF). */
  function profileNote(code) {
    const profile = el('button', { className: 'btn btn--primary', text: translate(code, 'generateProfile'), attrs: { type: 'button' } });
    profile.dataset.testid = 'chat-style-profile';
    profile.addEventListener('click', () => onStyleProfile());
    const note = el('div', { className: 'chat__bubble chat__bubble--system chat__built', attrs: { dir: DIRECTIONS[code], lang: code } }, [
      icon('check', { size: 16 }),
      el('div', { className: 'chat__built-body' }, [
        el('span', { text: translate(code, 'readyForProfile') }),
        el('div', { className: 'button-row' }, [profile]),
      ]),
    ]);
    note.dataset.testid = 'profile-note';
    return note;
  }
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

  let renderedCount = 0;
  let renderedProposalKey = '';
  function render() {
    const messages = model.getMessages();
    welcome.hidden = messages.length > 0 || model.getProposal() !== null || model.getBuilt() !== null;
    list.hidden = messages.length === 0;
    // Only newly added bubbles are created (and animate in); existing ones stay untouched.
    if (messages.length < renderedCount) {
      list.replaceChildren();
      renderedCount = 0;
    }
    messages.slice(renderedCount).forEach((message) => {
      // Designer and system bubbles keep the language (and direction) they were written in; the
      // customer's own text takes its direction from its content. Switching language changes neither.
      const written = message.role !== 'user' && DIRECTIONS[message.language] ? message.language : null;
      const bubble = el('div', {
        className: `chat__bubble chat__bubble--${message.role}`,
        attrs: written ? { dir: DIRECTIONS[written], lang: written } : { dir: 'auto' },
      });
      if (message.role === 'system') bubble.append(icon('info', { size: 16 }));
      bubble.append(el('span', { text: message.text, attrs: { dir: 'auto' } }));
      list.append(bubble);
    });
    renderedCount = messages.length;
    // One pinned note offering the PDF step: replaced, never added, so it never piles up.
    const built = model.getBuilt();
    const builtKey = built && onStyleProfile ? built.language : '';
    if (builtKey !== renderedBuiltKey) {
      renderedBuiltKey = builtKey;
      builtSlot.replaceChildren(...(builtKey ? [profileNote(built.language)] : []));
    }
    typing.hidden = !model.isBusy();
    sendButton.disabled = model.isBusy();
    if (!typing.hidden) list.append(typing); // keep the indicator last
    list.hidden = messages.length === 0 && typing.hidden;
    list.scrollTop = list.scrollHeight;

    // Re-render the card only when the proposal or its status changed (keeps its entrance animation calm).
    const proposal = model.getProposal();
    const status = model.getProposalStatus();
    const key = proposal ? `${proposal.id}:${status}` : '';
    if (key === renderedProposalKey) return;
    renderedProposalKey = key;
    proposalSlot.replaceChildren();
    if (proposal) {
      proposalSlot.append(renderProposalCard(proposal, status, {
        t,
        onConfirm,
        onCancel: () => model.cancelProposal(),
      }));
    }
  }

  const lang = () => (language ? language.get() : 'en');

  // Replay a one-shot CSS animation class (removed again when it ends).
  const playOnce = (node, className) => {
    node.classList.remove(className);
    void node.offsetWidth; // restart the animation if it is already running
    node.classList.add(className);
    node.addEventListener('animationend', () => node.classList.remove(className), { once: true });
  };
  let lastEnabled = null;

  function renderVoice() {
    if (!voice) return;
    const { state, speaking, enabled, error } = voice.getState();
    if (lastEnabled !== null && lastEnabled !== enabled) {
      playOnce(voiceSwitchState, 'chat__voice-toggle-state--flip');
      playOnce(voiceSwitch, enabled ? 'chat__voice-toggle--turned-on' : 'chat__voice-toggle--turned-off');
      if (enabled) playOnce(micButton, 'chat__mic--enter');
    }
    lastEnabled = enabled;
    const recording = state === 'recording';
    voiceSwitch.setAttribute('aria-checked', String(enabled));
    voiceSwitch.classList.toggle('chat__voice-toggle--on', enabled);
    voiceSwitch.classList.toggle('chat__voice-toggle--speaking', speaking);
    voiceSwitch.title = t('voiceToggleTitle');
    voiceSwitchLabel.textContent = t('voiceToggle');
    voiceSwitchState.textContent = t(enabled ? 'voiceOn' : 'voiceOff');
    micButton.hidden = !enabled;
    micButton.setAttribute('aria-pressed', String(recording));
    const micLabel = t(recording ? 'voiceMicStop' : 'voiceMic');
    micButton.setAttribute('aria-label', micLabel);
    micButton.title = micLabel;
    // While recording the microphone turns into a round red Stop button (a rounded square, no text).
    micButton.replaceChildren(icon(recording ? 'stop' : 'mic', { size: recording ? 22 : 20 }));
    micButton.classList.toggle('chat__mic--recording', recording);
    micButton.disabled = state === 'transcribing';
    const text = !enabled ? '' : error ? voiceErrorMessage(lang(), error)
      : recording ? t('voiceListening') : state === 'transcribing' ? t('voiceTranscribing') : speaking ? t('voiceSpeaking') : '';
    voiceStatus.textContent = text;
    voiceStatus.hidden = !text;
    voiceStatus.title = text;
    voiceStatus.classList.toggle('chat__voice-status--error', Boolean(error));
  }

  function applyLanguage() {
    container.lang = language ? language.get() : 'en';
    container.dir = language ? language.dir() : 'ltr';
    title.textContent = t('chatTitle');
    subtitle.textContent = t('chatSubtitle');
    status.textContent = connected ? t('statusOnline') : t('statusOffline');
    status.title = connected ? t('statusOnlineTitle') : t('statusOfflineTitle');
    input.placeholder = (hintKey && t(hintKey)) || t('placeholder');
    input.setAttribute('aria-label', t('inputLabel'));
    sendButton.setAttribute('aria-label', t('sendLabel'));
    hint.textContent = t('hint');
    voiceNote.textContent = t('voiceNote');
    welcome.setAttribute('aria-label', t('welcomeAria'));
    welcomeTitle.textContent = t('welcomeTitle');
    welcomeText.textContent = t('welcomeText');
    chipsBox.replaceChildren(...t('suggestions').map(makeChip));
    list.setAttribute('aria-label', t('conversation'));
    typing.textContent = t('thinking');
    renderedProposalKey = ''; // re-render the proposal card in the new language
    renderVoice();
  }

  if (voice) {
    micButton.addEventListener('click', () => voice.toggle());
    voiceSwitch.addEventListener('click', () => voice.setEnabled(!voice.getState().enabled));
    voice.subscribe(renderVoice);
    // Escape or a hidden tab drops an in-progress recording and sends nothing.
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') voice.cancel(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) voice.cancel(); });
  }

  container.replaceChildren(header, el('div', { className: 'chat__body' }, [welcome, list, builtSlot, proposalSlot]), el('div', { className: 'chat__footer' }, voice ? [voiceRow, composer, hint, voiceNote] : [composer, hint]));
  applyLanguage();
  model.subscribe(render);
  language?.subscribe(() => { applyLanguage(); render(); });
  render();

  return {
    /** Focus the composer. `entryId` picks a localized placeholder ('guided'). */
    focus: (entryId) => {
      hintKey = { guided: 'hintGuided' }[entryId] ?? null;
      input.placeholder = (hintKey && t(hintKey)) || t('placeholder');
      input.focus();
    },
    /** Dictated text goes into the composer for the customer to check and send; it is never sent for them. */
    setTranscript: (text) => {
      // Never overwrite what the customer has typed meanwhile: add the dictation after it.
      input.value = input.value.trim() ? `${input.value.trim()} ${text}`.slice(0, MAX_MESSAGE_LENGTH) : text;
      input.focus();
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}
