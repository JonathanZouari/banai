import '@fontsource/assistant/400.css';
import '@fontsource/assistant/500.css';
import '@fontsource/assistant/600.css';
import '@fontsource/assistant/700.css';
import { getAdvisories, getCatalog, getDefaultDesign, getDossier, sendChatMessage, verifyAiKey } from './api/client.js';
import { createAdvisoryFeed } from './advice/advisoryFeed.js';
import { countLevels, mountAdvisoryPanel } from './advice/advisoryPanel.js';
import { createStore } from './state/store.js';
import { diffDesigns } from './state/diff.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { bindQuickControls, stepDimension } from './quickControls.js';
import { createChatModel } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { coverPng, createRenderHud } from './render/renderHud.js';
import { bindVideoButton } from './render/video.js';
import { createKeyStorage } from './settings/keyStorage.js';
import { createAiSettingsModel } from './settings/aiSettingsModel.js';
import { createAiSettingsDialog } from './settings/aiSettingsDialog.js';
import { createToast } from './ui/toast.js';

const byId = (id) => document.getElementById(id);
const toast = createToast(byId('toast'));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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

/** Advice | chat tabs in the side column (WAI-ARIA tabs: arrows move between them). */
function bindSideTabs() {
  const tabs = [byId('tab-advice'), byId('tab-chat')];
  const select = (tab, focus = false) => {
    tabs.forEach((candidate) => {
      const on = candidate === tab;
      candidate.setAttribute('aria-selected', String(on));
      candidate.tabIndex = on ? 0 : -1;
      byId(candidate.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      select(tabs[(index + 1) % tabs.length], true);
    });
  });
  return { showChat: () => select(tabs[1]), showAdvice: () => select(tabs[0]) };
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

/** Undo / redo (ADR-023): buttons, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y. Text fields keep their own undo. */
function bindHistory(store) {
  const undo = byId('undo');
  const redo = byId('redo');
  const step = (forward) => {
    if (forward ? store.redo() : store.undo()) toast(forward ? 'בוצע שוב' : 'בוטל');
  };
  undo.addEventListener('click', () => step(false));
  redo.addEventListener('click', () => step(true));
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
    // event.code, not event.key: on a Hebrew layout the Z key types "ז".
    if (event.code === 'KeyZ') step(event.shiftKey);
    else if (event.code === 'KeyY') step(true);
    else return;
    event.preventDefault();
  });
  const sync = (state) => {
    undo.disabled = state.history.undo === 0;
    redo.disabled = state.history.redo === 0;
  };
  store.subscribe(sync);
  sync(store.getState());
}

/** Save a version, then hold to see it in place of the design (client only, ADR-023). */
function bindCompare(store) {
  const save = byId('version-save');
  const held = byId('version-held');
  const hold = byId('compare-hold');
  const card = byId('compare-card');
  const show = (on) => {
    const { design, version } = store.getState();
    if (on && version) {
      const lines = diffDesigns(design, version);
      byId('compare-list').replaceChildren(...(lines.length ? lines : ['זהה לתכנון הנוכחי']).map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }));
    }
    card.hidden = !on;
    hold.classList.toggle('is-holding', on);
    store.setComparing(on);
  };
  save.addEventListener('click', () => {
    store.saveVersion();
    toast('הגרסה נשמרה. החזיקו "החזק להשוואה" כדי לראות אותה');
  });
  byId('version-clear').addEventListener('click', () => store.clearVersion());
  hold.addEventListener('pointerdown', (event) => {
    hold.setPointerCapture?.(event.pointerId);
    show(true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => hold.addEventListener(type, () => {
    if (store.getState().ui.comparing) show(false);
  }));
  hold.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      show(true);
    }
  });
  hold.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') show(false);
  });
  const sync = (state) => {
    save.hidden = state.version !== null;
    held.hidden = state.version === null;
    if (state.version === null) card.hidden = true;
  };
  store.subscribe(sync);
  sync(store.getState());
}

/** The advisory panel, its tab badge, "show" and quick fixes. */
function bindAdvice(store, viewer) {
  const feed = createAdvisoryFeed({ fetchAdvisories: (design, { signal }) => getAdvisories(design, { signal }) });
  const badge = byId('advice-badge');
  const onShow = (item) => {
    const compartment = item.targets.find((target) => target.startsWith('comp:'));
    const interior = Boolean(compartment);
    const { design, ui } = store.getState();
    if (interior && design.doors.type !== 'none' && ui.doorsVisible && !ui.doorsOpen) store.setDoorsOpen(true);
    if (compartment) store.select(design.compartments[Number(compartment.slice(5))]?.id ?? null);
    setTimeout(() => viewer.flash?.(item.targets), interior && !reducedMotion() ? 380 : 0);
  };
  const onFix = (item) => {
    const result = store.dispatch(item.fix.ops);
    toast(result.ok ? `עודכן: ${item.fix.label}` : 'התיקון כבר לא מתאים לתכנון. נסו שוב בעוד רגע.');
  };
  mountAdvisoryPanel(byId('advice-view'), { feed, onFix, onShow });
  feed.subscribe((state) => {
    const { critical, warn } = countLevels(state.items);
    badge.hidden = critical + warn === 0;
    badge.textContent = String(critical + warn);
    badge.classList.toggle('tab-badge--critical', critical > 0);
  });
  feed.update(store.getState().design);
  store.subscribe((state) => feed.update(state.design));
  return feed;
}

/** Render HUD + dossier download (the finished render becomes the dossier cover). */
function bindRenderAndDossier(store, viewer) {
  const hud = createRenderHud({ hud: byId('render-hud'), viewer, toast });
  byId('open-render').addEventListener('click', () => {
    store.select(null);
    hud.start();
  });
  let shown = store.getState().design;
  store.subscribe((state) => {
    if (state.design === shown) return;
    shown = state.design;
    hud.invalidate();
    hud.stop(); // a render of an older design must not stay on screen
  });

  const button = byId('open-dossier');
  button.addEventListener('click', async () => {
    if (button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'מכין תיק…';
    const { design } = store.getState();
    const image = hud.latestImage();
    let withCover = Boolean(image);
    try {
      let pdf;
      try {
        pdf = await getDossier(design, { renderPng: image ? await coverPng(image) : null });
      } catch (error) {
        // A cover the server refuses (too large, unreadable) must not cost the dossier itself.
        if (!withCover || !['PAYLOAD_TOO_LARGE', 'INVALID_IMAGE'].includes(error?.code)) throw error;
        withCover = false;
        pdf = await getDossier(design);
      }
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'banai-dossier.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (withCover) toast('תיק הנגר מוכן, עם הרינדור בשער');
      else toast(image ? 'תיק הנגר מוכן, בלי הרינדור (השרת לא קיבל את התמונה)' : 'תיק הנגר מוכן. רינדור לפני ההורדה ייכנס לשער');
    } catch (error) {
      toast(error?.code === 'BUSY' ? 'השרת עסוק. נסו שוב בעוד רגע.' : 'לא הצלחנו להכין את תיק הנגר.');
    } finally {
      button.removeAttribute('aria-busy');
      button.textContent = 'תיק נגר';
    }
  });
  return hud;
}

/** Esc: close the help popover, leave a render, ignore form fields, otherwise clear the selection. */
function bindEscape(getApp) {
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
    const app = getApp();
    if (app?.hud.isActive()) app.hud.stop();
    else if (app?.store.getState().selection) app.store.select(null);
  });
  document.addEventListener('pointerdown', (event) => {
    if (help.open && !help.contains(event.target)) help.open = false;
  });
}

/** True on a CPU rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render), as in headless tests or without a GPU. */
function softwareRenderer() {
  try {
    const gl = document.querySelector('#viewer canvas')?.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    return /swiftshader|llvmpipe|software|basic render/i.test(String(name));
  } catch {
    return false;
  }
}

let app = null;
bindEscape(() => app);
const tabs = bindSideTabs();

async function boot() {
  let catalog;
  let initial;
  try {
    [catalog, initial] = await Promise.all([getCatalog(), getDefaultDesign()]);
  } catch {
    showError('אין חיבור לשירות התכנון. בדקו את החיבור ורעננו את הדף.');
    return;
  }
  // Validates the server data before anything is rendered (throws on invalid data).
  const store = createStore({ design: initial.design, revision: initial.revision, catalog });
  const viewer = createViewer(byId('viewer'), store, { onDimensionStep: (step) => stepDimension(store, step) });
  bindInteriorToggle(store);
  bindViewToolbar(viewer);
  bindQuickControls(store, viewer, byId('viewer'));
  mountPanel(byId('properties-content'), store);
  bindHistory(store);
  bindCompare(store);
  const feed = bindAdvice(store, viewer);
  const hud = bindRenderAndDossier(store, viewer);
  bindVideoButton(byId('open-video'), { viewer, getDesign: () => store.getState().design, toast, isBusy: () => hud.isActive() });
  const save = createSaveDialog();
  byId('open-save').addEventListener('click', save.open);
  app = { store, hud };
  removeLoading();
  // Compile the path tracer in the background so the first render starts at once. Not on a software
  // renderer: there the compile takes tens of seconds of CPU on every load (render still works on demand).
  if (!softwareRenderer()) (window.requestIdleCallback ?? setTimeout)(() => viewer.prewarm?.()?.catch?.(() => {}), { timeout: 3000 });

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
    onConfirm: () => chatModel.resolveProposal('הסוכן עוד לא מחובר לתכנון, ולכן שום דבר לא הוחל.'),
    aiSettings,
    onOpenSettings: settingsDialog.open,
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel, aiSettings, feed, hud });
  }

  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also open the chat tab.
      if (entry.id === 'basic') return;
      tabs.showChat();
      chat.focus(entry.composerHint);
    },
  });
}

boot().catch(() => {
  showError('לא הצלחנו להפעיל את התכנון. רעננו את הדף.');
});
