import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import { applyProposal, getCatalog, getDefaultDesign, getVoiceStatus, postChat, speak, transcribeAudio } from './api/client.js';
import { createRecorder } from './voice/recorder.js';
import { createPlayer } from './voice/player.js';
import { createVoiceModel } from './voice/voiceModel.js';
import { describeOps } from './chat/describeOps.js';
import { language } from './i18n/strings.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { createChatModel } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createShareMenu } from './share/shareMenu.js';
import { createExportDialog } from './export/exportDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { units } from './ui/units.js';
import { installRipple } from './ui/ripple.js';
import { icon } from './ui/icons.js';
import { attachPopover } from './ui/menu.js';
import { mountViewerToolbar } from './viewer/toolbar.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

/** Static buttons in index.html name their icon with data-icon. */
function addStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((node) => node.prepend(icon(node.dataset.icon)));
}

function bindHeaderMenus() {
  const settings = attachPopover(document.getElementById('settings-menu'), document.getElementById('settings-panel'), { role: 'dialog' });
  const relabel = () => {
    document.getElementById('settings-panel').setAttribute('aria-label', language.t('uiSettingsAria'));
  };
  language.subscribe(relabel);
  relabel();
  return { settings };
}

function bindLanguageSwitch(language) {
  const buttons = [...document.querySelectorAll('#lang-switch [data-lang]')];
  const sync = () => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === language.get())));
  buttons.forEach((b) => b.addEventListener('click', () => language.set(b.dataset.lang)));
  language.subscribe(sync);
  sync();
}

/** Static labels in index.html carry data-i18n / data-i18n-aria and follow the selected language. */
function bindStaticLanguage() {
  const apply = () => {
    document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = language.t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', language.t(node.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach((node) => { node.title = language.t(node.dataset.i18nTitle); });
    // The header keeps the English arrangement in every language; only the text and the open menus follow the language.
    document.querySelector('.topbar').dir = 'ltr';
    document.querySelectorAll('.topbar .popover').forEach((panel) => { panel.dir = language.dir(); });
    const properties = document.getElementById('properties-panel');
    properties.lang = language.get();
    properties.dir = language.dir();
  };
  language.subscribe(apply);
  apply();
}

function bindUnitSwitch() {
  const buttons = [...document.querySelectorAll('#unit-switch [data-unit]')];
  const sync = () => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.unit === units.get())));
  buttons.forEach((b) => b.addEventListener('click', () => units.set(b.dataset.unit)));
  units.subscribe(sync);
  sync();
}

const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function bindHistory(store, chatModel, language) {
  const undoButton = document.getElementById('undo');
  const redoButton = document.getElementById('redo');
  const undo = () => { if (store.undo().ok) chatModel.note(language.t('undone')); };
  const redo = () => { if (store.redo().ok) chatModel.note(language.t('redone')); };
  const sync = () => {
    undoButton.disabled = !store.canUndo();
    redoButton.disabled = !store.canRedo();
  };
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z (or Ctrl+Y), except while typing, where they edit the text.
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || isTyping(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
    else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
  });
  store.subscribe(sync);
  sync();
}

function bindDialogs({ store, viewer }) {
  const save = createSaveDialog();
  const render = createRenderDialog();
  const exporter = createExportDialog({ store, viewer });
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-export').addEventListener('click', exporter.open);
  document.getElementById('open-render').addEventListener('click', render.open);
  // Sharing needs a saved design's private link; saving arrives with Phase 7 and will call setLink().
  return createShareMenu({ trigger: document.getElementById('share-menu'), panel: document.getElementById('share-panel') });
}

async function boot() {
  document.getElementById('topbar-logo').append(createLogo({ size: 34, tagline: 'Wardrobe Designer' }));
  addStaticIcons();
  installRipple();
  bindHeaderMenus();
  bindLanguageSwitch(language);
  bindStaticLanguage();
  bindUnitSwitch();
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
  mountViewerToolbar(document.getElementById('viewer'), store, viewer);
  mountPanel(document.getElementById('properties-content'), store);
  const shareMenu = bindDialogs({ store, viewer });

  // The agent only proposes. The server signs proposals, and Confirm sends the signed proposal back
  // to be verified and applied; the committed design never changes until then.
  const agent = async ({ messages, design, revision }) => {
    const { reply, proposal } = await postChat({ messages, design, revision, language: language.get(), units: units.get() });
    if (!proposal) return { reply, proposal: null };
    // `changes` is described on every render, so the rows follow later language and unit switches.
    return {
      reply,
      proposal: Object.defineProperty({ ...proposal, id: proposal.signature }, 'changes', {
        enumerable: true,
        get() { return describeOps(this.ops, language.get(), units.get()); },
      }),
    };
  };
  // Voice is optional: the mic only appears when the server has it switched on and the browser can record.
  let chat = null;
  let voice = null;
  try {
    const status = await getVoiceStatus();
    const recorder = createRecorder({ maxSeconds: status.maxSeconds });
    if (status.enabled && recorder.isSupported()) {
      voice = createVoiceModel({
        recorder,
        player: createPlayer(),
        api: { transcribeAudio: (blob) => transcribeAudio(blob, language.get()), speak },
        onTranscript: (text) => chat.setTranscript(text),
      });
    }
  } catch { /* voice stays off: typing always works */ }
  const chatModel = createChatModel({
    getRevision: () => store.getState().revision,
    getDesign: () => store.getState().design,
    agent,
    language,
    onAssistantReply: (text) => voice?.speakReply(text),
  });
  chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel,
    connected: true,
    language,
    voice,
    onConfirm: async (proposal) => {
      const { design, revision } = store.getState();
      const { id, changes, ...signed } = proposal;
      try {
        const result = await applyProposal({ design, revision, proposal: signed });
        store.replace(result.design, result.revision);
        chatModel.resolveProposal(language.t('applied'));
      } catch (error) {
        chatModel.resolveProposal(error?.status === 409 ? language.t('stale') : language.t('applyFailed'));
      }
    },
  });
  bindHistory(store, chatModel, language);
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());
  units.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel, share: shareMenu });
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
