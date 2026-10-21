import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import { applyProposal, getCatalog, getDefaultDesign, getHealth, sendChat } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { bindCarpenterPdf } from './carpenter/exportPdf.js';
import { createHomeDialog } from './ui/homeDialog.js';
import { createLogo } from './ui/logo.js';
import { createOpenGuide } from './ui/openGuide.js';
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

function bindOpenToggle(store) {
  const toggle = document.getElementById('toggle-open');
  const guide = createOpenGuide(toggle.closest('.toggle'));
  toggle.addEventListener('change', () => {
    store.setSelectiveOpen(toggle.checked);
    if (toggle.checked) guide.show();
    else guide.hide();
  });
}

function bindUndo(store) {
  const button = document.getElementById('undo');
  button.addEventListener('click', () => store.undo());
  store.subscribe((state) => { button.disabled = !state.canUndo; });
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
  let health;
  try {
    // A failed health check only means "agent unknown": the editor still works without it.
    [catalog, initial, health] = await Promise.all([getCatalog(), getDefaultDesign(), getHealth().catch(() => null)]);
  } catch {
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  bindUndo(store);
  bindOpenToggle(store);
  mountPanel(document.getElementById('properties-content'), store);
  bindDialogs();
  bindCarpenterPdf({ button: document.getElementById('export-pdf'), store, viewer });

  // The agent is optional: without an OpenAI key on the server the panel says so honestly.
  const agent = health?.data.agent === true
    ? ({ messages, language: chatLanguage }) => {
      const { design, revision } = store.getState();
      return sendChat({ messages, design, revision, language: chatLanguage });
    }
    : null;
  const language = createLanguage();
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent, getLanguage: language.get });
  const t = () => language.strings();

  let applying = false;
  const confirmProposal = async (proposal) => {
    if (applying) return;
    if (!proposal.signed) {
      chatModel.resolveProposal(t().notApplied);
      return;
    }
    applying = true;
    const { design, revision } = store.getState();
    try {
      const result = await applyProposal({ design, revision, proposal: proposal.signed, language: language.get() });
      store.replaceDesign(result.design, result.revision);
      chatModel.resolveProposal(t().applied);
    } catch (error) {
      chatModel.resolveProposal(error?.code === 'STALE' ? t().stale : t().notApplied);
    } finally {
      applying = false;
    }
  };
  const chat = mountChat(document.getElementById('chat-panel'), { model: chatModel, onConfirm: confirmProposal, language });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  // Home asks first, then reloads: a reload shows the start screen with a fresh default design,
  // which is exactly what the warning promises (nothing is stored until the user saves).
  const homeDialog = createHomeDialog({ onConfirm: () => window.location.reload() });
  document.getElementById('go-home').addEventListener('click', homeDialog.open);

  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also focus the composer.
      if (entry.focusesChat) chat.focus(entry.id);
    },
  });
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
