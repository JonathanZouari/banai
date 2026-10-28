import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import {
  applyProposal, createSavedDesign, getCatalog, getDefaultDesign, getHealth, getSavedDesign, sendChat, updateSavedDesign,
} from './api/client.js';
import { createStore } from './state/store.js';
import { PRESETS, buildPreset } from './domain/presets.js';
import { PRESET_STRINGS, createPresetsDialog } from './entry/presetsDialog.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { renderSnapshot } from './viewer/snapshot.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createSession } from './auth/session.js';
import { createAuthDialog } from './auth/authDialog.js';
import { parseShareHash, shareHash } from './share/link.js';
import { createExportDialog } from './export/exportDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { installRipple } from './ui/ripple.js';

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
      showError('This link did not open a saved design, so the basic wardrobe is shown instead.');
    }
  }
  return { initial: await getDefaultDesign(), session: null };
}

function createSaver(store, language, initialSession, auth) {
  let session = initialSession;
  return async () => {
    const { design } = store.getState();
    const accessToken = await auth.accessToken(language.get());
    if (!accessToken) throw new Error('Your session has expired. Please log in again.');
    if (session) {
      const { revision } = await updateSavedDesign({ ...session, design, language: language.get(), accessToken });
      session = { ...session, revision };
    } else {
      const created = await createSavedDesign({ design, language: language.get(), accessToken });
      session = { designId: created.designId, token: created.accessToken, revision: created.revision };
    }
    window.history.replaceState(null, '', shareHash(session));
    return window.location.href;
  };
}

function bindDialogs({ storage, onSave, link, auth, language }) {
  const login = createAuthDialog({ session: auth, getLanguage: language.get });
  const save = createSaveDialog({
    available: storage, onSave, link, isLoggedIn: () => auth.user() !== null, onLogin: () => login.open('login'),
  });
  const render = createRenderDialog();
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);

  const authButton = document.getElementById('open-auth');
  const userLabel = document.getElementById('auth-user');
  const showUser = (user) => {
    authButton.textContent = user ? 'Log out' : 'Log in';
    userLabel.textContent = user?.email ?? '';
    userLabel.hidden = !user;
  };
  authButton.addEventListener('click', async () => {
    if (!auth.user()) {
      login.open('login');
      return;
    }
    await auth.logOut();
    // Back to the start screen's login, as a fresh page: the next customer inherits no design or link.
    window.location.assign(window.location.pathname);
  });
  auth.subscribe(showUser);
  showUser(auth.user());
}

async function boot() {
  document.getElementById('topbar-logo').append(createLogo({ size: 34, tagline: 'Wardrobe Designer' }));
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
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
  const auth = createSession();
  await auth.restore(language.get()); // a previous visit's login, if any
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  bindSkipLink();
  const exporter = createExportDialog({
    getDesign: () => store.getState().design,
    getLanguage: () => language.get(),
    getSnapshot: (design) => renderSnapshot(design, store.getState().catalog),
  });
  mountPanel(document.getElementById('properties-content'), store, { onExport: exporter.open });
  bindDialogs({
    storage: health?.data.storage === true,
    onSave: createSaver(store, language, session, auth),
    link: session ? window.location.href : '',
    auth,
    language,
  });

  // The agent is optional: without an OpenAI key on the server the panel says so honestly.
  const agent = health?.data.agent === true
    ? ({ messages, language: chatLanguage }) => {
      const { design, revision } = store.getState();
      return sendChat({ messages, design, revision, language: chatLanguage });
    }
    : null;
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
      chatModel.noteDesignReady(); // the final step: Generate Style Profile
    } catch (error) {
      chatModel.resolveProposal(error?.code === 'STALE' ? t().stale : t().notApplied);
    } finally {
      applying = false;
    }
  };
  const chat = mountChat(document.getElementById('chat-panel'), {
    model: chatModel, onConfirm: confirmProposal, language, onExport: exporter.open,
    onOpenPreset: (presetId) => openPreset(presetId),
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  // A template replaces the current design and brings its decorative room (viewer only).
  const openPreset = (presetId) => {
    const { catalog, revision } = store.getState();
    store.replaceDesign(buildPreset(presetId, catalog), revision + 1);
    store.setBackdrop(PRESETS.find((preset) => preset.id === presetId).backdrop);
  };
  const examples = createPresetsDialog({ onChoose: openPreset, getLanguage: language.get });
  const examplesButton = document.getElementById('open-presets');
  examplesButton.addEventListener('click', examples.open);
  const labelExamples = (lang) => {
    examplesButton.textContent = (PRESET_STRINGS[lang] ?? PRESET_STRINGS.he).button;
    examplesButton.lang = lang;
  };
  labelExamples(language.get());
  language.subscribe(labelExamples);

  if (session) return; // reopened from a link: straight into the editor
  mountStartScreen({
    session: auth,
    getLanguage: language.get,
    onChoose: (entry, presetId) => {
      // The basic wardrobe is already loaded (revision 1); only its room is added.
      if (presetId === 'basic') store.setBackdrop(PRESETS[0].backdrop);
      else if (presetId) openPreset(presetId);
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
