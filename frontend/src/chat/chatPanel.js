// Left column: header, a welcome with starter prompts, the conversation, the proposal card and
// the composer. This panel never changes the design by itself: only Confirm on a proposal does.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { MAX_MESSAGE_LENGTH, SUGGESTIONS } from './chatModel.js';
import { renderProposalCard } from './proposalCard.js';
import { createVoiceControls } from '../voice/voiceControls.js';

export function mountChat(container, { model, onConfirm, voice = null }) {
  container.classList.add('panel--chat');

  const header = el('header', { className: 'chat__header' }, [
    el('span', { className: 'chat__avatar' }, [icon('sparkle', { size: 22 })]),
    el('div', { className: 'chat__heading' }, [
      el('h2', { className: 'chat__title', text: 'AI Designer' }),
      el('p', { className: 'chat__subtitle', text: 'Design assistant' }),
    ]),
    el('span', {
      className: 'chat__status',
      text: model.hasAgent ? 'Ready' : 'Not connected',
      attrs: { title: model.hasAgent ? 'Proposes changes that you confirm before anything is applied.' : 'The AI agent is not connected.' },
    }),
  ]);

  const input = el('textarea', { className: 'chat__input', attrs: { rows: '2', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: 'Describe your wardrobe…', 'aria-label': 'Message to the AI designer' } });
  input.dataset.testid = 'chat-input';
  const sendButton = el('button', { className: 'icon-btn icon-btn--filled chat__send', attrs: { type: 'submit', 'aria-label': 'Send message' } }, [icon('send')]);
  sendButton.dataset.testid = 'chat-send';
  const controls = voice ? createVoiceControls(voice) : null;
  const composer = el('form', { className: 'chat__composer' }, controls ? [input, controls.mic, sendButton] : [input, sendButton]);
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
  ]);
  welcome.dataset.testid = 'chat-welcome';

  const list = el('div', { className: 'chat__messages', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' } });
  list.dataset.testid = 'chat-messages';
  const thinking = el('div', { className: 'chat__thinking', text: 'Thinking…', attrs: { role: 'status' } });
  thinking.dataset.testid = 'chat-thinking';
  thinking.hidden = true;
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
      bubble.append(el('span', { text: message.text }));
      list.append(bubble);
    });
    renderedCount = messages.length;
    list.scrollTop = list.scrollHeight;
    thinking.hidden = !model.isBusy();
    sendButton.disabled = model.isBusy();

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

  container.replaceChildren(header, el('div', { className: 'chat__body' }, [welcome, list, thinking, proposalSlot]), el('div', { className: 'chat__footer' }, controls ? [composer, controls.row, hint, controls.privacy] : [composer, hint]));
  model.subscribe(render);
  render();

  return {
    focus: (placeholder) => {
      if (placeholder) input.placeholder = placeholder;
      input.focus();
    },
    /** Re-render, e.g. after the design revision changed (a pending proposal may now be stale). */
    refresh: render,
  };
}
