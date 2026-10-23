import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import {
  applyProposal, createMyDesign, createSavedDesign, getCatalog, getDefaultDesign, getHealth, getMyDesign, getSavedDesign,
  listMyDesigns, refreshSession, sendChat, signIn, signOut, signUp, updateMyDesign, updateSavedDesign,
} from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { renderSnapshot } from './viewer/snapshot.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { myHash, parseMyHash, parseShareHash, shareHash } from './share/link.js';
import { createAccount } from './auth/account.js';
import { createAuthDialog } from './auth/authDialog.js';
import { createAccountDialog } from './auth/accountDialog.js';
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
 * The design to open: the saved one when the page was opened from its private link (or, signed in,
 * from /#my=<id>), else the basic wardrobe. `session` is what the next save writes over:
 * { designId, token, revision } for a link, { designId, mine: true, revision } for an account design.
 */
async function loadInitial(language, account, restored) {
  const link = parseShareHash(window.location.hash);
  if (link) {
    try {
      const saved = await getSavedDesign({ ...link, language });
      return { initial: { design: saved.design, revision: 1 }, session: { ...link, revision: saved.revision } };
    } catch {
      showError('This link did not open a saved design, so the basic wardrobe is shown instead.');
    }
  }
  const mine = parseMyHash(window.location.hash);
  if (mine) {
    try {
      if (!(await restored)) throw new Error('Not signed in');
      const saved = await account.withToken((accessToken) => getMyDesign({ accessToken, ...mine, language }));
      return { initial: { design: saved.design, revision: 1 }, session: { ...mine, mine: true, revision: saved.revision } };
    } catch {
      showError('Sign in with the account that saved this design to open it. The basic wardrobe is shown instead.');
    }
  }
  return { initial: await getDefaultDesign(), session: null };
}

function createSaver(store, language, initialSession, account) {
  let session = initialSession;
  return async () => {
    const { design } = store.getState();
    const lang = language.get();
    if (session?.mine) {
      const { revision } = await account.withToken((accessToken) => updateMyDesign({ accessToken, ...session, design, language: lang }));
      session = { ...session, revision };
    } else if (session) {
      const { revision } = await updateSavedDesign({ ...session, design, language: lang });
      session = { ...session, revision };
    } else {
      // Signed in: the new design also belongs to the account. Either way it gets a private link.
      const created = account.user()
        ? await account.withToken((accessToken) => createMyDesign({ accessToken, design, language: lang }))
        : await createSavedDesign({ design, language: lang });
      session = { designId: created.designId, token: created.accessToken, revision: created.revision };
    }
    window.history.replaceState(null, '', session.mine ? myHash(session) : shareHash(session));
    return window.location.href;
  };
}

function bindDialogs({ storage, onSave, link }) {
  const save = createSaveDialog({ available: storage, onSave, link });
  const render = createRenderDialog();
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);
}

/** Accounts PROTOTYPE: the top-bar button reads "Sign in", or the user's email once signed in. */
function bindAccount(account, language) {
  const trigger = document.getElementById('open-account');
  const signIn = createAuthDialog({ account });
  const mine = createAccountDialog({
    account,
    listDesigns: () => account.withToken((accessToken) => listMyDesigns({ accessToken, language: language.get() }))
      .then((data) => data.designs),
    onOpen: (designId) => {
      window.location.hash = myHash({ designId });
      window.location.reload();
    },
  });
  const show = (user) => {
    trigger.textContent = user ? user.email : 'Sign in';
    trigger.title = user ? 'My designs and sign out' : 'Sign in or create an account';
  };
  account.subscribe(show);
  show(account.user());
  trigger.hidden = false;
  trigger.addEventListener('click', () => (account.user() ? mine.open() : signIn.open()));
}

async function boot() {
  document.getElementById('topbar-logo').append(createLogo({ size: 34, tagline: 'Wardrobe Designer' }));
  installRipple();
  const language = createLanguage();
  const account = createAccount({ api: { signUp, signIn, refreshSession, signOut }, getLanguage: language.get });
  const restored = account.restore();
  let catalog;
  let initial;
  let session;
  let health;
  try {
    // A failed health check only means "agent and saving unknown": the editor still works without it.
    [catalog, { initial, session }, health] = await Promise.all([
      getCatalog(), loadInitial(language.get(), account, restored), getHealth().catch(() => null),
    ]);
  } catch {
    showError('Could not reach the design service. Please check your connection and reload.');
    return;
  }
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
    onSave: createSaver(store, language, session, account),
    link: session ? window.location.href : '',
  });
  if (health?.data.accounts === true) bindAccount(account, language);

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
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
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
