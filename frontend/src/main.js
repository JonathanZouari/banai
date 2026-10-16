import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import { getCatalog, getDefaultDesign, sendChatMessage, verifyAiKey } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { createChatModel } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createKeyStorage } from './settings/keyStorage.js';
import { createAiSettingsModel } from './settings/aiSettingsModel.js';
import { createAiSettingsDialog } from './settings/aiSettingsDialog.js';
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

  // The OpenAI key stays in this browser; the backend only checks it. load() re-checks a stored key.
  const keyStorage = createKeyStorage();
  const aiSettings = createAiSettingsModel({ storage: keyStorage, verify: (apiKey) => verifyAiKey(apiKey) });
  const settingsDialog = createAiSettingsDialog(aiSettings);
  document.getElementById('open-ai-settings').addEventListener('click', settingsDialog.open);
  aiSettings.load();

  // The agent sends the browser-held key with each turn; the server never stores it.
  const agent = {
    isReady: () => keyStorage.get() !== null && aiSettings.getState().status !== 'invalid_key',
    reply: (history) => sendChatMessage(keyStorage.get(), history).then((data) => data.reply),
  };
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent });
  // The agent is not connected yet, so a proposal can only come from the dev-only demo below.
  const chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel,
    onConfirm: () => chatModel.resolveProposal('The AI agent is not connected yet, so nothing was applied.'),
    aiSettings,
    onOpenSettings: settingsDialog.open,
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel, aiSettings });
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
