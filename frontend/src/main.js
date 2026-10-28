import {
  applyProposal, createSavedDesign, getCatalog, getDefaultDesign, getHealth, getSavedDesign, sendChat, updateSavedDesign,
} from './api/client.js';
import { createStore } from './state/store.js';
import { templateDesign } from './domain/presets.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { renderSnapshot } from './viewer/snapshot.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { parseShareHash, shareHash } from './share/link.js';
import { createExportDialog } from './export/exportDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { installRipple } from './ui/ripple.js';
import { THEMES, createTheme } from './ui/theme.js';
import {
  SITE_LANGUAGES, applyToDocument, onSiteLanguageChange, setSiteLanguage, siteLanguage, strings,
} from './ui/i18n.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

// Camera angle buttons: they move the 3D camera only and never change the design.
function bindViewPresets(viewer) {
  document.querySelectorAll('#view-presets [data-view]').forEach((button) => {
    button.addEventListener('click', () => viewer.setView(button.dataset.view));
  });
}

// Showcase rotation toggle. Shown only when motion is allowed; the viewer turns it off on any touch.
function bindAutoRotate(viewer) {
  const button = document.getElementById('auto-rotate');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const syncVisibility = () => { button.hidden = Boolean(reducedMotion?.matches); };
  syncVisibility();
  reducedMotion?.addEventListener('change', syncVisibility);
  button.addEventListener('click', () => viewer.setAutoRotate(!viewer.autoRotating));
}

// Theme slider: one stop per theme; the name is shown next to it and read out as the value.
function bindThemeSlider(theme) {
  const slider = document.getElementById('theme-slider');
  const name = document.getElementById('theme-name');
  slider.max = String(THEMES.length - 1);
  const sync = () => {
    slider.value = String(theme.index());
    name.textContent = strings().themeNames[theme.get()];
    slider.setAttribute('aria-valuetext', name.textContent);
  };
  slider.addEventListener('input', () => theme.set(THEMES[Number(slider.value)].id));
  theme.subscribe(sync);
  onSiteLanguageChange(sync);
  sync();
}

// Site language button: names the other language, in that language ("English" / "עברית").
function configureLanguageButton(button) {
  const t = strings();
  const other = SITE_LANGUAGES.find((code) => code !== siteLanguage());
  button.textContent = t.switchLanguage;
  button.lang = other;
  button.setAttribute('aria-label', t.switchLanguageLabel);
  return button;
}

function createLanguageButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary site-language';
  button.dataset.testid = 'site-language';
  button.addEventListener('click', () => setSiteLanguage(SITE_LANGUAGES.find((code) => code !== siteLanguage())));
  return configureLanguageButton(button);
}

function bindLanguageButton() {
  const button = document.getElementById('site-language');
  button.addEventListener('click', () => setSiteLanguage(SITE_LANGUAGES.find((code) => code !== siteLanguage())));
  onSiteLanguageChange(() => configureLanguageButton(button));
  configureLanguageButton(button);
}

function mountLogo() {
  const holder = document.getElementById('topbar-logo');
  const render = () => holder.replaceChildren(createLogo({ size: 34, tagline: strings().tagline }));
  onSiteLanguageChange(render);
  render();
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
    window.history.replaceState(null, '', shareHash(session));
    return window.location.href;
  };
}

// Dialogs are built in the site language; a new language rebuilds them (they are closed then).
function bindDialogs({ storage, onSave }) {
  let save;
  let render;
  const build = () => {
    save?.element.remove();
    render?.element.remove();
    const link = parseShareHash(window.location.hash) ? window.location.href : '';
    save = createSaveDialog({ available: storage, onSave, link });
    render = createRenderDialog();
  };
  build();
  onSiteLanguageChange(build);
  document.getElementById('open-save').addEventListener('click', () => save.open());
  document.getElementById('open-render').addEventListener('click', () => render.open());
}

async function boot() {
  const theme = createTheme(); // applied first, so nothing renders in the wrong colours
  applyToDocument(); // and the site language (Hebrew by default: right-to-left)
  onSiteLanguageChange(() => applyToDocument());
  bindThemeSlider(theme);
  bindLanguageButton();
  mountLogo();
  installRipple();
  const language = createLanguage();
  // The chat follows a change of site language (it keeps its own switch for one-off changes).
  onSiteLanguageChange((code) => language.set(code));
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
    showError(strings().serviceDown);
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(document.getElementById('viewer'), store, {
    onAutoRotateChange: (on) => document.getElementById('auto-rotate').setAttribute('aria-pressed', String(on)),
  });
  bindInteriorToggle(store);
  bindViewPresets(viewer);
  bindAutoRotate(viewer);
  theme.subscribe(() => viewer.applyTheme());
  bindSkipLink();
  const makeExporter = () => createExportDialog({
    getDesign: () => store.getState().design,
    getLanguage: () => language.get(),
    getSnapshot: (design) => renderSnapshot(design, store.getState().catalog),
  });
  let exporter = makeExporter();
  onSiteLanguageChange(() => {
    exporter.element.remove();
    exporter = makeExporter();
  });
  const openExport = () => exporter.open();
  mountPanel(document.getElementById('properties-content'), store, { onExport: openExport });
  bindDialogs({ storage: health?.data.storage === true, onSave: createSaver(store, language, session) });

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
    model: chatModel, onConfirm: confirmProposal, language, onExport: openExport,
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  if (session) return; // reopened from a link: straight into the editor
  mountStartScreen({
    languageButton: createLanguageButton,
    onChoose: (entry) => {
      // A template replaces the basic wardrobe loaded at boot. It is built and validated locally,
      // and committed as the next revision like any other new design.
      if (entry.templateId) {
        const { catalog: validCatalog, revision } = store.getState();
        store.replaceDesign(templateDesign(entry.templateId, validCatalog), revision + 1);
      }
      // All entry points open the same editor; the chat ones focus the composer, the manual ones
      // the properties panel, so keyboard focus never falls out of the page when the modal closes.
      if (entry.focusesChat) chat.focus(entry.id);
      else document.getElementById('properties-panel').focus();
    },
  });
}

boot().catch(() => {
  showError(strings().bootFailed);
});
