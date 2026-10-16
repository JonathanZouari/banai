// Left column: header, a welcome with starter prompts, the conversation, the proposal card and
// the composer. The agent answers in text only, so this panel never changes the design by itself. The header chip mirrors the OpenAI key status from AI settings.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH, SUGGESTIONS } from './chatModel.js';
import { renderProposalCard } from './proposalCard.js';
import { STATUS_LABELS } from '../settings/aiSettingsModel.js';

export function mountChat(container, { model, onConfirm, aiSettings, onOpenSettings }) {
  container.classList.add('panel--chat');

  // Shows the OpenAI key status (kept in sync with AI settings); clicking it opens the settings.
  const statusChip = el('button', { className: 'status-chip chat__status', attrs: { type: 'button', title: 'AI settings' } });
  statusChip.dataset.testid = 'chat-status';
  statusChip.addEventListener('click', () => onOpenSettings?.());
  const connectButton = el('button', { className: 'btn btn--tonal chat__connect', attrs: { type: 'button' } }, [icon('key', { size: 18 }), el('span', { text: 'Connect your OpenAI key' })]);
  connectButton.dataset.testid = 'chat-connect-key';
  connectButton.addEventListener('click', () => onOpenSettings?.());
  const renderKeyStatus = (state) => {
    statusChip.textContent = STATUS_LABELS[state.status];
    statusChip.dataset.status = state.status;
    connectButton.hidden = state.status === 'connected' || state.status === 'checking';
  };

  const header = el('header', { className: 'chat__header' }, [
    el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
    el('div', { className: 'chat__heading' }, [
      el('h2', { className: 'chat__title', text: 'AI Designer' }),
      el('p', { className: 'chat__subtitle', text: 'Design assistant' }),
    ]),
    statusChip,
  ]);

  const input = el('textarea', { className: 'chat__input', attrs: { dir: 'auto', rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: 'Describe your wardrobe…', 'aria-label': 'Message to the AI designer' } });
  input.dataset.testid = 'chat-input';
  const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit', 'aria-label': 'Send message' } }, [icon('send')]);
  sendButton.dataset.testid = 'chat-send';
  const composer = el('form', { className: 'chat__composer' }, [input, sendButton]);
  const hint = el('p', { className: 'chat__hint', text: 'Enter to send · Shift+Enter for a new line' });

  const chips = SUGGESTIONS.map((text) => {
    const chip = el('button', { className: 'suggestion', attrs: { type: 'button' } }, [icon('sparkle', { size: 16 }), el('span', { text })]);
    chip.dataset.testid = 'suggestion';
    chip.addEventListener('click', () => {
      input.value = text; // only fills the composer: nothing is sent until the customer presses send
      input.focus();
    });
    return chip;
  });
  const welcome = el('section', { className: 'welcome', attrs: { 'aria-label': 'Get started' } }, [
    el('h3', { className: 'welcome__title', text: 'What shall we design today?' }),
    el('p', { className: 'welcome__text', text: "Describe your wardrobe in your own words. I'll turn it into a proposal that you confirm before anything changes." }),
    el('div', { className: 'welcome__chips' }, chips),
    connectButton,
  ]);
  welcome.dataset.testid = 'chat-welcome';

  const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' } });
  list.dataset.testid = 'chat-messages';
  const typing = el('div', { className: 'chat__bubble chat__bubble--assistant chat__typing', attrs: { 'aria-label': 'The AI designer is typing' } }, [el('span'), el('span'), el('span')]);
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

  container.replaceChildren(header, el('div', { className: 'chat__body' }, [welcome, list, proposalSlot]), el('div', { className: 'chat__footer' }, [composer, hint]));
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
