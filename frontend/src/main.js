import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import { applyProposal, getCatalog, getDefaultDesign, sendChat, speakText, transcribeAudio } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { createChatModel, STALE_MESSAGE } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { createRecorder, isRecordingSupported } from './voice/recorder.js';
import { createVoiceModel, spokenText } from './voice/voiceModel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { GUIDED_GREETING } from './entry/entryPoints.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { installRipple } from './ui/ripple.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

function bindInteriorToggle(store) {
  const toggle = document.getElementById('toggle-interior');
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
}

function bindDialogs() {
  const save = createSaveDialog();
  const render = createRenderDialog();
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Plays an audio Blob. Returns { stop }. `onEnd` runs when playback finishes or fails. */
function playAudio(blob, onEnd) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const finish = () => {
    URL.revokeObjectURL(url);
    onEnd();
  };
  audio.addEventListener('ended', finish, { once: true });
  audio.addEventListener('error', finish, { once: true });
  audio.play().catch(finish);
  return { stop: () => { audio.pause(); URL.revokeObjectURL(url); } };
}

/** Reads each new assistant turn (and its proposal's changes) aloud while "read replies" is on. */
function bindSpokenReplies(chatModel, voice) {
  let lastId = 0;
  let lastProposalId = null;
  chatModel.subscribe(() => {
    const messages = chatModel.getMessages();
    const proposal = chatModel.getProposal();
    const fresh = messages.filter((message) => message.id > lastId && message.role === 'assistant');
    lastId = messages.length ? messages.at(-1).id : lastId;
    const newProposal = proposal && proposal.id !== lastProposalId ? proposal : null;
    if (proposal) lastProposalId = proposal.id;
    if (!fresh.length && !newProposal) return;
    voice.speakReply(spokenText(fresh.map((message) => message.text).join(' '), newProposal ? newProposal.changes : []));
  });
}

async function boot() {
  document.getElementById('topbar-logo').append(createLogo({ size: 34, tagline: 'Wardrobe Designer' }));
  installRipple();
  let catalog;
  let initial;
  try {
    [catalog, initial] = await Promise.all([getCatalog(), getDefaultDesign()]);
  } catch {
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  mountPanel(document.getElementById('properties-content'), store);
  bindDialogs();

  // The agent only ever sees the committed design and revision as they are when the message is sent.
  let chatMode = 'free'; // 'guided' only when the customer chose the guided start
  const agent = {
    respond: (messages) => {
      const { design, revision } = store.getState();
      return sendChat({ messages, design, revision, mode: chatMode });
    },
  };
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent });
  let applying = false;
  // Confirm: the server verifies the signature and that the design is still the one the proposal was
  // made for; only then are the same ops dispatched locally. Any doubt leaves the design untouched.
  async function confirmProposal(proposal) {
    if (applying || chatModel.getProposal() !== proposal || chatModel.getProposalStatus() !== 'pending') return;
    applying = true;
    const { design, revision } = store.getState();
    try {
      await applyProposal({ design, revision, proposal: proposal.raw });
    } catch (error) {
      chatModel.resolveProposal(error.code === 'STALE' ? STALE_MESSAGE : 'The changes could not be applied, so nothing was changed.');
      applying = false;
      return;
    }
    applying = false;
    if (store.getState().revision !== revision) {
      chatModel.resolveProposal(STALE_MESSAGE); // edited by hand while the server was checking
      return;
    }
    const result = store.dispatch(proposal.raw.ops);
    chatModel.resolveProposal(result.ok ? 'Changes applied.' : 'The changes could not be applied, so nothing was changed.');
  }
  const voice = isRecordingSupported() ? createVoiceModel({
    recorder: createRecorder(),
    transcribe: transcribeAudio,
    speak: speakText,
    play: playAudio,
    sendText: (text) => chatModel.send(text),
    storage: safeStorage(),
  }) : null;
  const chat = mountChat(document.getElementById('chat-panel'), { model: chatModel, onConfirm: confirmProposal, voice });
  if (voice) bindSpokenReplies(chatModel, voice);
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also focus the composer.
      chatMode = entry.id === 'guided' ? 'guided' : 'free';
      if (entry.id === 'guided') chatModel.greet(GUIDED_GREETING);
      if (entry.id !== 'basic') chat.focus(entry.composerHint);
    },
  });
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
