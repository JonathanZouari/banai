import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { getCatalog, getDefaultDesign, sendChatMessage, verifyAiKey } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { readChatCollapsed, writeChatCollapsed } from './editor/uiPrefs.js';
import { createViewer } from './viewer/viewer.js';
import { bindQuickControls, stepDimension } from './quickControls.js';
import { createChatModel } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createKeyStorage } from './settings/keyStorage.js';
import { createAiSettingsModel } from './settings/aiSettingsModel.js';
import { createAiSettingsDialog } from './settings/aiSettingsDialog.js';

const byId = (id) => document.getElementById(id);

function removeLoading() {
  document.querySelector('#viewer .viewer-loading')?.remove();
}

function showError(message) {
  removeLoading();
  const banner = byId('error-banner');
  banner.hidden = false;
  banner.querySelector('.banner__message').textContent = message;
}

byId('error-retry').addEventListener('click', () => location.reload());

/** AI column: expanded by default on wide screens; a stored user choice overrides. */
function bindChatPanel() {
  const workspace = document.querySelector('.workspace');
  const toggles = [byId('chat-toggle'), byId('chat-rail-toggle')];
  const wide = window.matchMedia('(min-width: 1280px)');
  let choice = readChatCollapsed();
  const apply = () => {
    const collapsed = choice ?? !wide.matches;
    workspace.classList.toggle('workspace--chat-collapsed', collapsed);
    toggles.forEach((toggle) => toggle.setAttribute('aria-expanded', String(!collapsed)));
  };
  toggles.forEach((toggle) => toggle.addEventListener('click', () => {
    const fromRail = toggle === toggles[1];
    choice = !workspace.classList.contains('workspace--chat-collapsed');
    writeChatCollapsed(choice);
    apply();
    if (fromRail && !choice) byId('chat-body').querySelector('h2, [tabindex="-1"], textarea')?.focus();
  }));
  wide.addEventListener?.('change', apply);
  apply();
}

function bindInteriorToggle(store) {
  const toggle = byId('toggle-interior');
  toggle.checked = !store.getState().ui.doorsVisible;
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
  toggle.disabled = false;
}

/** Camera view buttons + Fit. Each viewer call is guarded so the app boots without them. */
function bindViewToolbar(viewer) {
  const buttons = [...document.querySelectorAll('[data-view]')];
  const reflect = (name) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  if (typeof viewer.setView === 'function') {
    buttons.forEach((button) => {
      button.disabled = false;
      button.addEventListener('click', () => {
        viewer.setView(button.dataset.view);
        if (typeof viewer.subscribeView !== 'function') reflect(button.dataset.view);
      });
    });
    if (typeof viewer.subscribeView === 'function') viewer.subscribeView(reflect);
    if ('viewName' in viewer) reflect(viewer.viewName);
  }
  const fit = byId('view-fit');
  if (typeof viewer.fitView === 'function') {
    fit.disabled = false;
    fit.addEventListener('click', () => viewer.fitView());
  }
}

/** Esc: close the help popover, ignore form fields, otherwise clear the selection. */
function bindEscape(getStore) {
  const help = document.querySelector('details.help');
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, select, textarea') || target?.isContentEditable) return;
    if (help.open && target?.closest('details.help')) {
      help.open = false;
      help.querySelector('summary').focus();
      return;
    }
    const store = getStore();
    if (store?.getState().selection) store.select(null);
  });
  document.addEventListener('pointerdown', (event) => {
    if (help.open && !help.contains(event.target)) help.open = false;
  });
}

function bindDialogs() {
  const save = createSaveDialog();
  const render = createRenderDialog();
  byId('open-save').addEventListener('click', save.open);
  byId('open-render').addEventListener('click', render.open);
}

let activeStore = null;
bindChatPanel();
bindEscape(() => activeStore);

async function boot() {
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
  const viewer = createViewer(byId('viewer'), store, { onDimensionStep: (step) => stepDimension(store, step) });
  bindInteriorToggle(store);
  bindViewToolbar(viewer);
  bindQuickControls(store, viewer, byId('viewer'));
  mountPanel(byId('properties-content'), store);
  bindDialogs();
  activeStore = store;
  removeLoading();

  // The OpenAI key stays in this browser; the backend only checks it. load() re-checks a stored key.
  const keyStorage = createKeyStorage();
  const aiSettings = createAiSettingsModel({ storage: keyStorage, verify: (apiKey) => verifyAiKey(apiKey) });
  const settingsDialog = createAiSettingsDialog(aiSettings);
  byId('open-ai-settings').addEventListener('click', settingsDialog.open);
  aiSettings.load();

  // The agent sends the browser-held key with each turn; the server never stores it.
  const agent = {
    isReady: () => keyStorage.get() !== null && aiSettings.getState().status !== 'invalid_key',
    reply: (history) => sendChatMessage(keyStorage.get(), history).then((data) => data.reply),
  };
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent });
  // Signed proposals arrive with the design-aware agent (ADR-020); until then a proposal can only come from the dev-only demo.
  const chat = mountChat(byId('chat-body'), {
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
