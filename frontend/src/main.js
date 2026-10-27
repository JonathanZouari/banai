import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import {
  applyProposal, createSavedDesign, getCatalog, getDefaultDesign, getHealth, getSavedDesign, getVoiceStatus, postChat,
  speak, transcribeAudio, updateSavedDesign,
} from './api/client.js';
import { createRecorder } from './voice/recorder.js';
import { createPlayer } from './voice/player.js';
import { createVoiceModel } from './voice/voiceModel.js';
import { describeOps } from './chat/describeOps.js';
import { language } from './i18n/strings.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { renderSnapshot } from './viewer/snapshot.js';
import { createChatModel } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createShareMenu } from './share/shareMenu.js';
import { parseShareHash, shareHash } from './share/link.js';
import { createExportDialog } from './export/exportDialog.js';
import { createStyleProfileDialog } from './export/styleProfileDialog.js';
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

// The skip link moves focus without touching the hash: the hash may hold the private design link.
function bindSkipLink() {
  const link = document.querySelector('.skip-link');
  link?.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector(link.getAttribute('href'))?.focus();
  });
}

/**
 * The design to open: the saved one when the page was opened from its private link, else the basic
 * wardrobe. `session` ({ designId, token, revision }) is what the next save writes over.
 */
async function loadInitial() {
  const link = parseShareHash(window.location.hash);
  if (link) {
    try {
      const saved = await getSavedDesign({ ...link, language: language.get() });
      return { initial: { design: saved.design, revision: 1 }, session: { ...link, revision: saved.revision } };
    } catch {
      showError(language.t('linkNotOpened'));
    }
  }
  return { initial: await getDefaultDesign(), session: null };
}

/** Saves the current design (new, or over the reopened one) and resolves to its private link. */
function createSaver(store, initialSession, onLink) {
  let session = initialSession;
  return async () => {
    const { design } = store.getState();
    if (session) {
      const { revision } = await updateSavedDesign({ ...session, design, language: language.get() });
      session = { ...session, revision };
    } else {
      const created = await createSavedDesign({ design, language: language.get() });
      session = { designId: created.designId, token: created.accessToken, revision: created.revision };
    }
    window.history.replaceState(null, '', shareHash(session));
    onLink(window.location.href);
    return window.location.href;
  };
}

function bindDialogs({ store, viewer, storage, session }) {
  // Sharing needs a saved design's private link: Save (or opening one) gives it.
  const shareMenu = createShareMenu({ trigger: document.getElementById('share-menu'), panel: document.getElementById('share-panel') });
  const link = session ? window.location.href : '';
  if (link) shareMenu.setLink(link);
  const save = createSaveDialog({ available: storage, onSave: createSaver(store, session, (url) => shareMenu.setLink(url)), link });
  const render = createRenderDialog();
  const exporter = createExportDialog({ store, viewer });
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-export').addEventListener('click', exporter.open);
  document.getElementById('open-render').addEventListener('click', render.open);
  return shareMenu;
}

async function boot() {
  document.getElementById('topbar-logo').append(createLogo({ size: 34, tagline: 'Wardrobe Designer' }));
  addStaticIcons();
  installRipple();
  bindHeaderMenus();
  bindLanguageSwitch(language);
  bindStaticLanguage();
  bindUnitSwitch();
  bindSkipLink();
  let catalog;
  let initial;
  let session;
  let health;
  try {
    // A failed health check only means "agent and saving unknown": the editor still works without it.
    [catalog, { initial, session }, health] = await Promise.all([
      getCatalog(), loadInitial(), getHealth().catch(() => null),
    ]);
  } catch {
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  mountViewerToolbar(document.getElementById('viewer'), store, viewer);
  mountPanel(document.getElementById('properties-content'), store);
  const shareMenu = bindDialogs({ store, viewer, storage: health?.data.storage === true, session });
  const styleProfile = createStyleProfileDialog({
    getDesign: () => store.getState().design,
    getSnapshot: (design) => renderSnapshot(design, store.getState().catalog),
  });

  // The agent only proposes. The server signs proposals, and Confirm sends the signed proposal back
  // to be verified and applied; the committed design never changes until then. Without an OpenAI key
  // on the server the panel says so honestly.
  const agent = health?.data.agent !== true ? null : async ({ messages, design, revision }) => {
    const result = await postChat({ messages, design, revision, language: language.get(), units: units.get() });
    if (!result.proposal) return { ...result, proposal: null };
    // `changes` is described on every render, so the rows follow later language and unit switches.
    return {
      ...result,
      proposal: Object.defineProperty({ ...result.proposal, id: result.proposal.proposalId }, 'changes', {
        enumerable: true,
        get() { return describeOps(this.ops, language.get(), units.get()); },
      }),
    };
  };
  // Voice is optional: the mic only appears when the server has it switched on and the browser can record.
  let chat = null;
  let voice = null;
  try {
    const status = agent ? await getVoiceStatus() : { enabled: false };
    const recorder = status.enabled ? createRecorder({ maxSeconds: status.maxSeconds }) : null;
    if (recorder?.isSupported()) {
      voice = createVoiceModel({
        recorder,
        player: createPlayer(),
        api: {
          transcribeAudio: (blob) => transcribeAudio(blob, language.get()),
          // Each piece travels with the whole signed reply: the server only speaks what it signed.
          speak: (piece, reply) => speak({ text: reply.text, signature: reply.signature, piece, language: reply.language }),
        },
        onTranscript: (text) => chat.setTranscript(text),
      });
    }
  } catch { /* voice stays off: typing always works */ }
  const chatModel = createChatModel({
    getRevision: () => store.getState().revision,
    getDesign: () => store.getState().design,
    agent,
    language,
    onAssistantReply: (reply) => { if (reply.signature) voice?.speakReply(reply.text, reply); },
  });
  chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel,
    connected: chatModel.isConnected(),
    language,
    voice,
    onStyleProfile: styleProfile.open,
    onConfirm: async (proposal) => {
      const { design, revision } = store.getState();
      const { id, changes, ...signed } = proposal;
      try {
        const result = await applyProposal({ design, revision, proposal: signed, language: language.get() });
        store.replace(result.design, result.revision);
        chatModel.resolveProposal(language.t('applied'));
        chatModel.noteDesignReady(); // the final step: Generate Style Profile
      } catch (error) {
        chatModel.resolveProposal(error?.code === 'STALE' ? language.t('stale') : language.t('applyFailed'));
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

  if (session) return; // reopened from a link: straight into the editor
  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones focus the composer, the manual
      // one the properties panel, so keyboard focus never falls out of the page when the modal closes.
      if (entry.focusesChat) chat.focus(entry.id);
      else document.getElementById('properties-panel').focus();
    },
  });
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
