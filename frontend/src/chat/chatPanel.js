// Chat tab: header, a short welcome, the conversation, the proposal card and the composer. No
// starter chips or multiple choice (ADR-025): the customer just talks. The agent answers in text only, so
// this panel never changes the design by itself. The header chip mirrors the OpenAI key status from AI
// settings. The column speaks the session language (ADR-029): its texts and direction follow it.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH } from './chatModel.js';
import { renderProposalCard } from './proposalCard.js';
import { STATUS_LABELS } from '../settings/aiSettingsModel.js';
import { AGENT_NAME, AI_VOICE_DISCLOSURE } from './speech.js';
import {
  CHAT_LANGUAGES, LANGUAGE_NAMES, ct, getChatLanguage, isRtl, onChatLanguage, setChatLanguage,
} from './chatI18n.js';

const COMPOSER_PLACEHOLDER = 'כתבו לבוב…';

/**
 * `voice` (optional): (micButton, { input, send(text) }) => void wires push-to-talk to the mic button;
 * without it the button stays hidden.
 * `speech` (optional, ADR-028): { prefs, speaker } from chat/speech.js. Adds the speaker toggle in the
 * header and a "speaking" pill above the composer; replies to spoken messages are read aloud.
 */
export function mountChat(container, { model, onConfirm, aiSettings, onOpenSettings, voice = null, speech = null }) {
  container.classList.add('panel--chat');

  // Shows the OpenAI key status (kept in sync with AI settings); clicking it opens the settings.
  const statusChip = el('button', { className: 'status-chip chat__status', attrs: { type: 'button' } });
  statusChip.dataset.testid = 'chat-status';
  statusChip.addEventListener('click', () => onOpenSettings?.());
  const connectLabel = el('span');
  const connectButton = el('button', { className: 'btn btn--tonal chat__connect', attrs: { type: 'button' } }, [icon('key', { size: 18 }), connectLabel]);
  connectButton.dataset.testid = 'chat-connect-key';
  connectButton.addEventListener('click', () => onOpenSettings?.());
  let keyState = aiSettings.getState();
  const renderKeyStatus = (state) => {
    keyState = state;
    statusChip.textContent = ct(STATUS_LABELS[state.status]);
    statusChip.dataset.status = state.status;
    connectButton.hidden = state.status === 'connected' || state.status === 'checking';
  };

  // The session language (ADR-029): a compact picker; the choice is saved by the host.
  const languagePicker = el('select', { className: 'chat__language' }, CHAT_LANGUAGES.map((lang) => {
    const option = el('option', { text: LANGUAGE_NAMES[lang], attrs: { value: lang, lang } });
    option.selected = lang === getChatLanguage();
    return option;
  }));
  languagePicker.dataset.testid = 'chat-language';
  languagePicker.addEventListener('change', () => setChatLanguage(languagePicker.value));

  // Spoken replies: a mute toggle in the header, and a pill that says an AI voice is talking.
  const speakerToggle = speech ? el('button', { className: 'icon-btn chat__speaker', attrs: { type: 'button' } }) : null;
  const speaking = speech ? el('button', { className: 'chat__speaking', attrs: { type: 'button' } }) : null;
  const renderToggle = () => {
    const on = speech.prefs.isEnabled();
    speakerToggle.replaceChildren(icon(on ? 'volume' : 'volumeOff'));
    speakerToggle.setAttribute('aria-pressed', String(on));
    const label = on ? ct('תשובות לשאלות בקול מוקראות ({ai}). לחצו להשתקה', { ai: ct(AI_VOICE_DISCLOSURE) })
      : ct('הקראת תשובות כבויה. לחצו להפעלה');
    speakerToggle.setAttribute('aria-label', label);
    speakerToggle.title = label;
  };
  const renderSpeaking = (state) => {
    speaking.hidden = state === 'idle';
    speaking.dataset.state = state;
    const ai = ct(AI_VOICE_DISCLOSURE);
    speaking.replaceChildren(icon('volume', { size: 16 }), el('span', {
      text: state === 'loading' ? ct('בוב מכין תשובה קולית · {ai}', { ai }) : ct('בוב מדבר · {ai} · עצירה', { ai }),
    }));
  };
  if (speech) {
    speakerToggle.dataset.testid = 'chat-speaker';
    speaking.dataset.testid = 'chat-speaking';
    speaking.hidden = true;
    speakerToggle.addEventListener('click', () => {
      speech.prefs.setEnabled(!speech.prefs.isEnabled());
      if (!speech.prefs.isEnabled()) speech.speaker.stop();
    });
    speaking.addEventListener('click', () => speech.speaker.stop());
    speech.prefs.subscribe(renderToggle);
    speech.speaker.subscribe(renderSpeaking);
  }

  const title = el('h2', { className: 'chat__title' });
  const subtitle = el('p', { className: 'chat__subtitle' });
  const header = el('header', { className: 'chat__header' }, [
    el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
    el('div', { className: 'chat__heading' }, [title, subtitle]),
    // The controls drop to a second row when the column is narrow, instead of squeezing the title.
    el('div', { className: 'chat__tools' }, [languagePicker, ...(speakerToggle ? [speakerToggle] : []), statusChip]),
  ]);

  const input = el('textarea', { className: 'chat__input', attrs: { dir: 'auto', rows: '2', maxlength: String(MAX_MESSAGE_LENGTH) } });
  input.dataset.testid = 'chat-input';
  const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit' } }, [icon('send')]);
  sendButton.dataset.testid = 'chat-send';
  const mic = el('button', { className: 'icon-btn chat__mic', attrs: { type: 'button' } }, [icon('mic')]);
  mic.dataset.testid = 'chat-mic';
  mic.hidden = !voice;
  const composer = el('form', { className: 'chat__composer' }, [input, mic, sendButton]);
  const hint = el('p', { className: 'chat__hint' });

  const welcomeTitle = el('h3', { className: 'welcome__title' });
  const welcomeText = el('p', { className: 'welcome__text' });
  const welcome = el('section', { className: 'welcome' }, [welcomeTitle, welcomeText, connectButton]);
  welcome.dataset.testid = 'chat-welcome';

  const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite' } });
  list.dataset.testid = 'chat-messages';
  const typing = el('div', { className: 'chat__bubble chat__bubble--assistant chat__typing' }, [el('span'), el('span'), el('span')]);
  typing.dataset.testid = 'chat-typing';
  const proposalSlot = el('div', { className: 'chat__proposal' });
  let customPlaceholder = null;

  /** Every fixed text of the column, in the session language, and the column's direction. */
  function applyLanguage() {
    const lang = getChatLanguage();
    container.lang = lang;
    container.dir = isRtl(lang) ? 'rtl' : 'ltr';
    languagePicker.value = lang;
    languagePicker.setAttribute('aria-label', ct('שפת השיחה'));
    languagePicker.title = ct('שפת השיחה');
    title.textContent = ct(AGENT_NAME);
    subtitle.textContent = ct('רואה את התכנון · מציע, ואתם מאשרים');
    statusChip.title = ct('הגדרות AI');
    connectLabel.textContent = ct('חיבור מפתח OpenAI');
    // A start-screen hint is Hebrew; in another language the composer shows its own placeholder.
    input.placeholder = (lang === 'he' && customPlaceholder) || ct(COMPOSER_PLACEHOLDER);
    input.setAttribute('aria-label', ct('הודעה לבוב הבנאי'));
    sendButton.setAttribute('aria-label', ct('שליחה'));
    mic.setAttribute('aria-label', ct('החזיקו כדי לדבר'));
    mic.title = ct('החזיקו כדי לדבר · שחררו לשליחה');
    hint.textContent = ct('Enter לשליחה · Shift+Enter לשורה חדשה');
    welcome.setAttribute('aria-label', ct('פתיחה'));
    welcomeTitle.textContent = ct('מה מתכננים היום?');
    welcomeText.textContent = ct('ספרו במילים שלכם מה חשוב לכם בארון, מה צריך להיכנס אליו או מה מפריע לכם בתכנון. כל שינוי מגיע כהצעה, ושום דבר לא משתנה בלי אישור שלכם.');
    list.setAttribute('aria-label', ct('שיחה'));
    typing.setAttribute('aria-label', ct('בוב כותב'));
    renderKeyStatus(keyState);
    if (speech) {
      renderToggle();
      renderSpeaking(speech.speaker.getState());
    }
    renderedProposalKey = ''; // the card is rebuilt in the new language
    render();
  }

  const submit = () => {
    if (model.send(input.value).ok) input.value = '';
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

  let renderedCount = 0;
  let renderedProposalKey = '';
  function render() {
    const messages = model.getMessages();
    welcome.hidden = messages.length > 0 || model.getProposal() !== null;
    list.hidden = messages.length === 0;
    // Only newly added bubbles are created (and animate in); existing ones stay untouched.
    if (messages.length < renderedCount) {
      list.replaceChildren();
      renderedCount = 0;
    }
    messages.slice(renderedCount).forEach((message) => {
      const bubble = el('div', { className: `chat__bubble chat__bubble--${message.role}` });
      if (message.role === 'system') bubble.append(icon('info', { size: 16 }));
      bubble.append(el('span', { text: message.text, attrs: { dir: 'auto' } }));
      bubble.dataset.testid = `chat-bubble-${message.role}`;
      list.append(bubble);
    });
    renderedCount = messages.length;
    typing.hidden = !model.isThinking();
    if (!typing.hidden) list.hidden = false;
    list.append(typing);
    sendButton.disabled = model.isThinking();
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
        onConfirm,
        onCancel: () => model.cancelProposal(),
      }));
    }
  }

  container.replaceChildren(header, el('div', { className: 'chat__body' }, [welcome, list, proposalSlot]), el('div', { className: 'chat__footer' }, [...(speaking ? [speaking] : []), composer, hint]));
  // A voice message goes through the same path as a typed one; the customer still confirms any change.
  // It is marked as spoken, so the reply is written for the ear and read aloud (ADR-028).
  voice?.(mic, { input, send: (text) => model.send(text, { spoken: true }) });
  model.subscribe(render);
  aiSettings.subscribe(renderKeyStatus);
  onChatLanguage(applyLanguage);
  applyLanguage();

  return {
    focus: (placeholder) => {
      if (placeholder) {
        customPlaceholder = placeholder;
        input.placeholder = placeholder;
      }
      input.focus();
    },
    /** Write `text` into the composer for the customer to edit and send (never sent from here). */
    draft(text) {
      input.value = String(text ?? '').slice(0, MAX_MESSAGE_LENGTH);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}
