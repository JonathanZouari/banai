import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import { applyProposal, getCatalog, getDefaultDesign, postChat } from './api/client.js';
import { describeOps } from './chat/describeOps.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { createChatModel, STALE_MESSAGE } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
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

function bindUndo(store, chatModel) {
  const button = document.getElementById('undo');
  const sync = () => { button.disabled = !store.canUndo(); };
  button.addEventListener('click', () => {
    if (store.undo().ok) chatModel.note('Last change undone.');
  });
  store.subscribe(sync);
  sync();
}

function bindDialogs() {
  const save = createSaveDialog();
  const render = createRenderDialog();
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);
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

  // The agent only proposes. The server signs proposals, and Confirm sends the signed proposal back
  // to be verified and applied; the committed design never changes until then.
  const agent = async ({ messages, design, revision }) => {
    const { reply, proposal } = await postChat({ messages, design, revision });
    return {
      reply,
      proposal: proposal && { ...proposal, id: proposal.signature, changes: describeOps(proposal.ops) },
    };
  };
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, getDesign: () => store.getState().design, agent });
  const chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel,
    connected: true,
    onConfirm: async (proposal) => {
      const { design, revision } = store.getState();
      const { id, changes, ...signed } = proposal;
      try {
        const result = await applyProposal({ design, revision, proposal: signed });
        store.replace(result.design, result.revision);
        chatModel.resolveProposal('Changes applied to your design.');
      } catch (error) {
        chatModel.resolveProposal(error?.status === 409 ? STALE_MESSAGE : (error?.message || 'The changes could not be applied.'));
      }
    },
  });
  bindUndo(store, chatModel);
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also focus the composer.
      if (entry.id !== 'basic') chat.focus(entry.composerHint);
    },
  });
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
