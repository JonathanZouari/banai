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
import { hasHingedDoors } from './viewer/swing.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { bindPdfExport } from './export/exportButton.js';
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

/** Open/closed hinged doors. Only meaningful for hinged doors, so it is disabled otherwise (sliding, none, hidden). */
function bindDoorsOpenToggle(store) {
  const toggle = document.getElementById('toggle-doors-open');
  toggle.addEventListener('change', () => store.setDoorsOpen(toggle.checked));
  store.subscribe(({ design, ui }) => {
    toggle.checked = ui.doorsOpen;
    toggle.disabled = !hasHingedDoors(design) || !ui.doorsVisible;
  });
  const { design, ui } = store.getState();
  toggle.disabled = !hasHingedDoors(design) || !ui.doorsVisible;
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
  bindDoorsOpenToggle(store);
  mountPanel(document.getElementById('properties-content'), store);
  bindDialogs();
  bindPdfExport({ button: document.getElementById('export-pdf'), store, onError: showError });

  // The agent only ever sees the committed design and revision as they are when the message is sent.
  // It is optional: without an OpenAI key on the server the panel says so honestly.
  let chatMode = 'free'; // 'guided' only when the customer chose the guided start
  const agent = health?.data.agent === true
    ? ({ messages, language: chatLanguage }) => {
      const { design, revision } = store.getState();
      return sendChat({ messages, design, revision, mode: chatMode, language: chatLanguage });
    }
    : null;
  const language = createLanguage();
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent, getLanguage: language.get });
  const t = () => language.strings();
  let applying = false;
  // Confirm: the server verifies the signature and that the design is still the one the proposal was
  // made for; only then are the same ops dispatched locally. Any doubt leaves the design untouched.
  async function confirmProposal(proposal) {
    if (applying || chatModel.getProposal() !== proposal || chatModel.getProposalStatus() !== 'pending') return;
    applying = true;
    const { design, revision } = store.getState();
    try {
      await applyProposal({ design, revision, proposal: proposal.raw, language: language.get() });
    } catch (error) {
      chatModel.resolveProposal(error.code === 'STALE' ? t().stale : t().notApplied);
      applying = false;
      return;
    }
    applying = false;
    if (store.getState().revision !== revision) {
      chatModel.resolveProposal(t().stale); // edited by hand while the server was checking
      return;
    }
    const result = store.dispatch(proposal.raw.ops);
    chatModel.resolveProposal(result.ok ? t().applied : t().notApplied);
  }
  const chat = mountChat(document.getElementById('chat-panel'), { model: chatModel, onConfirm: confirmProposal, language });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also focus the composer.
      chatMode = entry.id === 'guided' ? 'guided' : 'free';
      if (entry.id === 'guided') chatModel.greet(t().guidedGreeting);
      if (entry.focusesChat) chat.focus(entry.id);
    },
  });
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
