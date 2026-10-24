// Rubik: Hebrew + Latin in one family (each file carries both subsets via unicode-range).
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import {
  applyProposal, createSavedDesign, getCatalog, getDefaultDesign, getHealth, getSavedDesign, sendChat, transcribe, updateSavedDesign,
} from './api/client.js';
import { createRouter } from './app/router.js';
import { canRecord } from './chat/voice.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { renderSnapshot } from './viewer/snapshot.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountHome } from './entry/homeScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { parseShareHash, shareHash } from './share/link.js';
import { createExportDialog } from './export/exportDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { installRipple } from './ui/ripple.js';
import { applyDocumentLanguage, createUiLanguage, getUiLanguage, t } from './ui/i18n.js';
import { createLanguageSwitch } from './ui/languageSwitch.js';
import { createViewSwitch } from './ui/viewSwitch.js';
import { createPhotoStore } from './room/photo.js';
import { mountRoomPanel } from './room/roomPanel.js';
import { mountRoomStage } from './room/roomStage.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

// The skip link moves focus without touching the hash: the hash may hold the private design link.
function bindSkipLink() {
  const link = document.querySelector('.skip-link');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector(link.getAttribute('href')).focus();
  });
}

function bindInteriorToggle(store) {
  const toggle = document.getElementById('toggle-interior');
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
}

/**
 * The design to open: the saved one when the page was opened from its private link, else the basic
 * wardrobe. `session` ({ designId, token, revision }) is what the next save writes over.
 */
async function loadInitial(language) {
  const link = parseShareHash(window.location.hash);
  if (link) {
    try {
      const saved = await getSavedDesign({ ...link, language });
      return { initial: { design: saved.design, revision: 1 }, session: { ...link, revision: saved.revision } };
    } catch {
      showError(t().app.errorLinkFailed);
    }
  }
  return { initial: await getDefaultDesign(), session: null };
}

function createSaver(store, language, initialSession) {
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
    window.history.replaceState({ ...(window.history.state ?? {}) }, '', shareHash(session));
    return window.location.href;
  };
}

/**
 * A dialog built on first open and rebuilt when the UI language has changed since, so its text always
 * matches the interface. `factory()` returns { element, open }.
 */
function lazyDialog(factory) {
  let built = null;
  let builtLanguage = null;
  return {
    open() {
      if (!built || builtLanguage !== getUiLanguage()) {
        built?.element.remove();
        built = factory();
        builtLanguage = getUiLanguage();
      }
      built.open();
    },
  };
}

function bindDialogs({ storage, onSave }) {
  // The private link, once there is one, is in the address bar (saved now or reopened from it).
  const currentLink = () => (parseShareHash(window.location.hash) ? window.location.href : '');
  const save = lazyDialog(() => createSaveDialog({ available: storage, onSave, link: currentLink() }));
  const render = lazyDialog(createRenderDialog);
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);
}

// Set once the router exists: the top-bar logo returns to the homepage; the view switch changes view.
let goHome = null;
let goView = null;

function mountLogo() {
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'topbar__home';
  home.dataset.testid = 'go-home';
  home.setAttribute('aria-label', t().home.goHome);
  home.append(createLogo({ size: 34, tagline: t().app.tagline }));
  home.addEventListener('click', () => goHome?.());
  document.getElementById('topbar-logo').replaceChildren(home);
}

/** While the homepage is shown, the workspace under it is out of the tab order and the a11y tree. */
function setWorkspaceInert(inert) {
  document.querySelectorAll('.skip-link, .topbar, .workspace').forEach((node) => { node.inert = inert; });
}

async function boot() {
  const uiLanguage = createUiLanguage();
  applyDocumentLanguage();
  mountLogo();
  document.getElementById('ui-language-slot').replaceWith(createLanguageSwitch(uiLanguage));
  installRipple();
  const language = createLanguage();
  let catalog;
  let initial;
  let session;
  let health;
  try {
    // A failed health check only means "agent and saving unknown": the editor still works without it.
    [catalog, { initial, session }, health] = await Promise.all([
      getCatalog(), loadInitial(language.get()), getHealth().catch(() => null),
    ]);
  } catch {
    showError(t().app.errorNoService);
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  bindSkipLink();
  const exporter = lazyDialog(() => createExportDialog({
    getDesign: () => store.getState().design,
    getLanguage: () => language.get(),
    getSnapshot: (design) => renderSnapshot(design, store.getState().catalog),
  }));
  const panel = mountPanel(document.getElementById('properties-content'), store, { onExport: exporter.open });
  // Room fit (ADR-008): the photo lives only in this browser tab's memory.
  const photos = createPhotoStore();
  const roomPanel = mountRoomPanel(document.getElementById('room-panel'), {
    store, photos, onRecommend: (text) => chat.send(text),
  });
  const roomStage = mountRoomStage(document.getElementById('room-stage'), {
    store, photos, render: renderSnapshot, onDropFile: (file) => roomPanel.usePhoto(file),
  });
  const viewSwitch = createViewSwitch({ onChange: (view) => goView?.(view) });
  document.getElementById('view-switch-slot').replaceWith(viewSwitch.element);
  bindDialogs({
    storage: health?.data.storage === true,
    onSave: createSaver(store, language, session),
  });
  // Switching the interface language re-renders every text, and the chat follows it.
  uiLanguage.subscribe((code) => {
    applyDocumentLanguage();
    mountLogo();
    panel.refresh();
    roomPanel.refresh();
    roomStage.refresh();
    viewSwitch.refresh();
    viewer.refreshLabels();
    language.set(code);
  });

  // The agent is optional: without an OpenAI key on the server the panel says so honestly.
  const agent = health?.data.agent === true
    ? ({ messages, language: chatLanguage }) => {
      const { design, revision } = store.getState();
      return sendChat({ messages, design, revision, language: chatLanguage });
    }
    : null;
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent, getLanguage: language.get });
  const chatT = () => language.strings();

  let applying = false;
  const confirmProposal = async (proposal) => {
    if (applying) return;
    if (!proposal.signed) {
      chatModel.resolveProposal(chatT().notApplied);
      return;
    }
    applying = true;
    const { design, revision } = store.getState();
    try {
      const result = await applyProposal({ design, revision, proposal: proposal.signed, language: language.get() });
      store.replaceDesign(result.design, result.revision);
      chatModel.resolveProposal(chatT().applied);
      chatModel.noteDesignReady(); // the final step: Generate Style Profile
    } catch (error) {
      chatModel.resolveProposal(error?.code === 'STALE' ? chatT().stale : chatT().notApplied);
    } finally {
      applying = false;
    }
  };
  const chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel, onConfirm: confirmProposal, language, onExport: exporter.open,
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  // Homepage and designer. Every way in opens the same editor and data model; keyboard focus always
  // lands somewhere useful, so it never falls out of the page when the homepage closes.
  const startRevision = store.getState().revision;
  let afterShow = null;
  const home = mountHome({
    language: uiLanguage,
    agentConnected: Boolean(agent),
    voice: agent ? { ready: canRecord(), transcribe: (blob) => transcribe(blob, language.get()) } : null,
    onPrompt: (intent) => enterDesigner(() => (intent.kind === 'message' ? chat.send(intent.text) : chat.focus('guided'))),
    onManual: () => enterDesigner(() => {
      const width = document.querySelector('[data-testid="dim-width"]');
      width?.focus();
      width?.select(); // typing replaces the value instead of appending to it
    }),
    onBasic: () => enterDesigner(() => document.getElementById('properties-panel').focus()),
  });
  const router = createRouter({
    initial: session ? 'designer' : 'home', // reopened from a private link: straight into the editor
    onShow: (view, { initial }) => {
      if (view === 'home') {
        setWorkspaceInert(true);
        home.show({ canContinue: Boolean(session) || store.getState().revision !== startRevision });
        return;
      }
      home.hide();
      setWorkspaceInert(false);
      const room = view === 'room';
      document.body.classList.toggle('is-room', room);
      document.getElementById('room-stage').hidden = !room;
      document.getElementById('room-panel').hidden = !room;
      document.getElementById('properties-panel').hidden = room;
      viewSwitch.set(view);
      if (room) roomStage.show();
      else roomStage.hide();
      if (initial) return;
      const focusDefault = () => document.getElementById(room ? 'room-panel' : 'properties-panel').focus();
      (room ? focusDefault : afterShow ?? focusDefault)();
      afterShow = null;
    },
  });
  function enterDesigner(focus) {
    afterShow = focus;
    router.go('designer');
  }
  goHome = () => router.go('home');
  goView = (view) => router.go(view);
}

boot().catch(() => {
  showError(t().app.errorStart);
});
