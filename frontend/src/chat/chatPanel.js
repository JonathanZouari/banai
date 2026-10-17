// Chat tab: header, a short welcome, the conversation, the proposal card and the composer. No
// starter chips or multiple choice (ADR-025): the customer just talks. The agent answers in text only, so this panel never changes the design by itself. The header chip mirrors the OpenAI key status from AI settings.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH } from './chatModel.js';
import { renderProposalCard } from './proposalCard.js';
import { STATUS_LABELS } from '../settings/aiSettingsModel.js';
import { AI_VOICE_DISCLOSURE } from './speech.js';

/**
 * `voice` (optional): (micButton, { input, send(text) }) => void wires push-to-talk to the mic button;
 * without it the button stays hidden.
 * `speech` (optional, ADR-028): { prefs, speaker } from chat/speech.js. Adds the speaker toggle in the
 * header and a "speaking" pill above the composer; replies to spoken messages are read aloud.
 */
export function mountChat(container, { model, onConfirm, aiSettings, onOpenSettings, voice = null, speech = null }) {
  container.classList.add('panel--chat');

  // Shows the OpenAI key status (kept in sync with AI settings); clicking it opens the settings.
  const statusChip = el('button', { className: 'status-chip chat__status', attrs: { type: 'button', title: 'הגדרות AI' } });
  statusChip.dataset.testid = 'chat-status';
  statusChip.addEventListener('click', () => onOpenSettings?.());
  const connectButton = el('button', { className: 'btn btn--tonal chat__connect', attrs: { type: 'button' } }, [icon('key', { size: 18 }), el('span', { text: 'חיבור מפתח OpenAI' })]);
  connectButton.dataset.testid = 'chat-connect-key';
  connectButton.addEventListener('click', () => onOpenSettings?.());
  const renderKeyStatus = (state) => {
    statusChip.textContent = STATUS_LABELS[state.status];
    statusChip.dataset.status = state.status;
    connectButton.hidden = state.status === 'connected' || state.status === 'checking';
  };

  // Spoken replies: a mute toggle in the header, and a pill that says an AI voice is talking.
  const speakerToggle = speech ? el('button', { className: 'icon-btn chat__speaker', attrs: { type: 'button' } }) : null;
  const speaking = speech ? el('button', { className: 'chat__speaking', attrs: { type: 'button' } }) : null;
  if (speech) {
    speakerToggle.dataset.testid = 'chat-speaker';
    speaking.dataset.testid = 'chat-speaking';
    speaking.hidden = true;
    const renderToggle = () => {
      const on = speech.prefs.isEnabled();
      speakerToggle.replaceChildren(icon(on ? 'volume' : 'volumeOff'));
      speakerToggle.setAttribute('aria-pressed', String(on));
      const label = on ? `תשובות לשאלות בקול מוקראות (${AI_VOICE_DISCLOSURE}). לחצו להשתקה` : 'הקראת תשובות כבויה. לחצו להפעלה';
      speakerToggle.setAttribute('aria-label', label);
      speakerToggle.title = label;
    };
    speakerToggle.addEventListener('click', () => {
      speech.prefs.setEnabled(!speech.prefs.isEnabled());
      if (!speech.prefs.isEnabled()) speech.speaker.stop();
    });
    speaking.addEventListener('click', () => speech.speaker.stop());
    const renderSpeaking = (state) => {
      speaking.hidden = state === 'idle';
      speaking.dataset.state = state;
      speaking.replaceChildren(icon('volume', { size: 16 }), el('span', {
        text: state === 'loading' ? `בנאי מכין תשובה קולית · ${AI_VOICE_DISCLOSURE}` : `בנאי מדבר · ${AI_VOICE_DISCLOSURE} · עצירה`,
      }));
    };
    speech.prefs.subscribe(renderToggle);
    speech.speaker.subscribe(renderSpeaking);
    renderToggle();
    renderSpeaking(speech.speaker.getState());
  }

  const header = el('header', { className: 'chat__header' }, [
    el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
    el('div', { className: 'chat__heading' }, [
      el('h2', { className: 'chat__title', text: 'בנאי' }),
      el('p', { className: 'chat__subtitle', text: 'רואה את התכנון · מציע, ואתם מאשרים' }),
    ]),
    // The controls drop to a second row when the column is narrow, instead of squeezing the title.
    el('div', { className: 'chat__tools' }, [...(speakerToggle ? [speakerToggle] : []), statusChip]),
  ]);

  const input = el('textarea', { className: 'chat__input', attrs: { dir: 'auto', rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: 'כתבו לבנאי…', 'aria-label': 'הודעה לבנאי' } });
  input.dataset.testid = 'chat-input';
  const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit', 'aria-label': 'שליחה' } }, [icon('send')]);
  sendButton.dataset.testid = 'chat-send';
  const mic = el('button', { className: 'icon-btn chat__mic', attrs: { type: 'button', 'aria-label': 'החזיקו כדי לדבר', title: 'החזיקו כדי לדבר · שחררו לשליחה' } }, [icon('mic')]);
  mic.dataset.testid = 'chat-mic';
  mic.hidden = !voice;
  const composer = el('form', { className: 'chat__composer' }, [input, mic, sendButton]);
  const hint = el('p', { className: 'chat__hint', text: 'Enter לשליחה · Shift+Enter לשורה חדשה' });

  const welcome = el('section', { className: 'welcome', attrs: { 'aria-label': 'פתיחה' } }, [
    el('h3', { className: 'welcome__title', text: 'מה מתכננים היום?' }),
    el('p', { className: 'welcome__text', text: 'ספרו במילים שלכם מה חשוב לכם בארון, מה צריך להיכנס אליו או מה מפריע לכם בתכנון. כל שינוי מגיע כהצעה, ושום דבר לא משתנה בלי אישור שלכם.' }),
    connectButton,
  ]);
  welcome.dataset.testid = 'chat-welcome';

  const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'שיחה' } });
  list.dataset.testid = 'chat-messages';
  const typing = el('div', { className: 'chat__bubble chat__bubble--assistant chat__typing', attrs: { 'aria-label': 'בנאי כותב' } }, [el('span'), el('span'), el('span')]);
  typing.dataset.testid = 'chat-typing';
  const proposalSlot = el('div', { className: 'chat__proposal' });

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
  render();
  aiSettings.subscribe(renderKeyStatus);
  renderKeyStatus(aiSettings.getState());

  return {
    focus: (placeholder) => {
      if (placeholder) input.placeholder = placeholder;
      input.focus();
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}
