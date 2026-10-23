import '@fontsource/assistant/400.css';
import '@fontsource/assistant/500.css';
import '@fontsource/assistant/600.css';
import '@fontsource/assistant/700.css';
import {
  applyProposal, getAdvisories, getCatalog, getDefaultDesign, getDossier, getHealth, sendChatMessage, synthesizeSpeech, transcribeAudio,
  verifyAiKey,
} from './api/client.js';
import { applyOps } from './domain/apply.js';
import { createAdvisoryFeed } from './advice/advisoryFeed.js';
import { countLevels, mountAdvisoryPanel } from './advice/advisoryPanel.js';
import { createStore } from './state/store.js';
import { diffDesigns } from './state/diff.js';
import { mountPanel } from './editor/panel.js';
import { nudge, targetForSelection } from './viewer/dragRules.js';
import { friendlyError } from './editor/opsFromForm.js';
import { createViewer } from './viewer/viewer.js';
import { bindQuickControls, stepDimension } from './quickControls.js';
import { createChatModel } from './chat/chatModel.js';
import { mountChat } from './chat/chatPanel.js';
import { bindPushToTalk } from './chat/voice.js';
import { createSpeaker, createSpeechPrefs, speechErrorMessage } from './chat/speech.js';
import {
  ct, getChatLanguage, loadChatLanguage, onChatLanguage, saveChatLanguage, setChatLanguage,
} from './chat/chatI18n.js';
import { mountStartScreen } from './entry/startScreen.js';
import { openAboutDialog } from './entry/about.js';
import { createProjectsDialog } from './share/projectsDialog.js';
import { createCustomerDialog } from './share/customerDialog.js';
import { parseShareHash } from './share/remote.js';
import { mountAlertSheet } from './advice/alertSheet.js';
import { coverPng, createRenderHud } from './render/renderHud.js';
import { bindVideoMenu } from './render/video.js';
import { createKeyStorage } from './settings/keyStorage.js';
import { createAiSettingsModel } from './settings/aiSettingsModel.js';
import { createAiSettingsDialog } from './settings/aiSettingsDialog.js';
import { createToast } from './ui/toast.js';
import { bindMenubar } from './ui/menubar.js';
import { version } from '../package.json';

const byId = (id) => document.getElementById(id);
// Wired once the chat exists (later in boot): asking Bob from a warning, and resetting for a new project.
const hooks = { askBob: null, onOpened: null };
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

// The skip link moves focus without touching the hash: the hash may hold the private project link.
document.querySelector('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  byId('properties-panel').focus();
});

/**
 * The chat stays in the side column, always visible. The advice opens from the Help menu as a panel over the
 * 3D view ("ייעוץ"), and "פתיחת הצ'אט" puts the cursor in the chat.
 */
function bindSideViews() {
  const float = byId('advice-float');
  const toggle = byId('tab-advice');
  const set = (on) => {
    float.hidden = !on;
    toggle.setAttribute('aria-pressed', String(on));
  };
  toggle.addEventListener('click', () => set(float.hidden));
  byId('advice-close').addEventListener('click', () => set(false));
  byId('tab-chat').addEventListener('click', () => document.querySelector('[data-testid="chat-input"]')?.focus());
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || float.hidden || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest('input, select, textarea, details.help[open]')) return;
    set(false);
  });
  return { closeAdvice: () => set(false) };
}

// Arrow keys: the axis and the direction a selected part moves (physical left and right, also in RTL).
const NUDGE_KEYS = Object.freeze({ ArrowLeft: ['x', -1], ArrowRight: ['x', 1], ArrowUp: ['y', 1], ArrowDown: ['y', -1] });

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
  const helpBadge = byId('help-badge'); // the same count on the closed Help menu
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
  // A change that brings a new warning pops it up over the 3D view, with its fix and "ask Bob".
  const alerts = mountAlertSheet(byId('viewer'), { feed, onFix, onShow, onAsk: (text) => hooks.askBob?.(text) });
  feed.subscribe((state) => {
    const { critical, warn } = countLevels(state.items);
    badge.hidden = critical + warn === 0;
    badge.textContent = String(critical + warn);
    badge.classList.toggle('tab-badge--critical', critical > 0);
    helpBadge.hidden = badge.hidden;
    helpBadge.textContent = badge.textContent;
    helpBadge.classList.toggle('tab-badge--critical', critical > 0);
  });
  feed.update(store.getState().design);
  store.subscribe((state) => feed.update(state.design));
  return { feed, alerts };
}

/** Render HUD + dossier download (the finished render becomes the dossier cover). */
function bindRenderAndDossier(store, viewer, getCustomer = () => null) {
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

  // The dossier menu: the carpenter's language (ADR-029). Each option downloads the PDF in it.
  const menu = document.querySelector('.dossier-menu');
  const button = byId('open-dossier');
  const label = button.textContent;
  // Without the customer's details the dossier still works; the menu says where to add them.
  const customerNote = menu.querySelector('[data-testid="dossier-customer-note"]');
  menu.addEventListener('toggle', () => {
    if (menu.open && customerNote) customerNote.hidden = Boolean(getCustomer());
  });
  menu.querySelectorAll('[data-lang]').forEach((option) => option.addEventListener('click', () => {
    menu.open = false;
    download(option.dataset.lang);
  }));
  async function download(language) {
    if (button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'מכין תוכנית…';
    const { design } = store.getState();
    const image = hud.latestImage();
    let withCover = Boolean(image);
    try {
      let pdf;
      try {
        pdf = await getDossier(design, { renderPng: image ? await coverPng(image) : null, language, customer: getCustomer() });
      } catch (error) {
        // A cover the server refuses (too large, unreadable) must not cost the dossier itself.
        if (!withCover || !['PAYLOAD_TOO_LARGE', 'INVALID_IMAGE'].includes(error?.code)) throw error;
        withCover = false;
        pdf = await getDossier(design, { language, customer: getCustomer() });
      }
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = language === 'he' ? 'banai-dossier.pdf' : `banai-dossier-${language}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (withCover) toast('תיק הנגר מוכן, עם הרינדור בשער');
      else toast(image ? 'תיק הנגר מוכן, בלי הרינדור (השרת לא קיבל את התמונה)' : 'תיק הנגר מוכן. רינדור לפני ההורדה ייכנס לשער');
    } catch (error) {
      toast(error?.code === 'BUSY' ? 'השרת עסוק. נסו שוב בעוד רגע.' : 'לא הצלחנו להכין את תיק הנגר.');
    } finally {
      button.removeAttribute('aria-busy');
      button.textContent = label;
    }
  }
  return hud;
}

const warnings = (items) => items.filter((item) => item.level !== 'info').length;

/**
 * The card data for a signed proposal: the changes (a dry run with the same engine the editor uses)
 * and the advisory impact (the server's rules on the design before and after). The signed proposal
 * rides along untouched; only the server can apply it.
 */
async function previewProposal(signed, design, catalog) {
  let preview;
  try {
    preview = applyOps(design, signed.ops, catalog);
  } catch {
    return null; // cannot happen for a proposal signed on this design; never show what we could not check
  }
  const changes = diffDesigns(design, preview).map((line) => {
    const at = line.indexOf(':');
    return at > 0 ? { title: line.slice(0, at), detail: line.slice(at + 1).trim() } : { title: line, detail: '' };
  });
  let impact = null;
  try {
    const [before, after] = await Promise.all([getAdvisories(design), getAdvisories(preview)]);
    const delta = warnings(after) - warnings(before);
    if (delta > 0) impact = ct(delta === 1 ? '+{n} אזהרה בייעוץ' : '+{n} אזהרות בייעוץ', { n: delta });
    else if (delta < 0) impact = ct(delta === -1 ? '{n} אזהרה פחות בייעוץ' : '{n} אזהרות פחות בייעוץ', { n: -delta });
    else impact = ct('בלי שינוי באזהרות');
  } catch { /* the card works without the impact line */ }
  return {
    id: signed.signature.slice(0, 16), baseRevision: signed.baseRevision, summary: signed.summary,
    changes: changes.length ? changes : [{ title: signed.summary, detail: '' }], impact, signed,
  };
}

/** Esc: close an open top-bar menu, leave a render, ignore form fields, otherwise clear the selection. */
function bindEscape(getApp) {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, select, textarea') || target?.isContentEditable) return;
    const menu = target?.closest('details.help');
    if (menu?.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
      return;
    }
    const app = getApp();
    if (app?.hud.isActive()) app.hud.stop();
    else if (app?.store.getState().selection) app.store.select(null);
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
bindMenubar();
document.querySelectorAll('[data-app-version]').forEach((node) => { node.textContent = `${version} · bobHabanai`; });
bindEscape(() => app);
const tabs = bindSideViews();

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
  const viewer = createViewer(byId('viewer'), store, {
    onDimensionStep: (step) => stepDimension(store, step),
    onDragError: (error) => toast(`לא הוזז: ${friendlyError(error)}`), // the engine refused the drop; nothing changed
    onMeasureChange: ({ active, count }) => { // the ruler's button, its hint and "נקה מדידות"
      byId('measure-toggle').setAttribute('aria-pressed', String(active));
      byId('measure-hint').hidden = !active;
      byId('measure-clear').hidden = count === 0;
    },
  });
  byId('measure-toggle').addEventListener('click', () => viewer.setMeasuring(!viewer.measuring));
  byId('measure-clear').addEventListener('click', () => viewer.clearMeasurements());
  bindInteriorToggle(store);
  bindViewToolbar(viewer);
  bindQuickControls(store, viewer, byId('viewer'));
  mountPanel(byId('properties-content'), store);
  bindHistory(store);
  bindCompare(store);
  const { feed, alerts } = bindAdvice(store, viewer);
  let peopleCount = store.getState().design.household?.people?.length ?? 0;
  store.subscribe((state) => {
    const count = state.design.household?.people?.length ?? 0;
    if (count > peopleCount && !state.ui.showFigure) store.setShowFigure(true); // a new person is seen at once
    peopleCount = count;
  });
  let projectCustomer = () => null; // the projects dialog, created below, owns the details
  const hud = bindRenderAndDossier(store, viewer, () => projectCustomer());
  bindVideoMenu(document.querySelector('details[data-testid="video-menu"]'), { viewer, getDesign: () => store.getState().design, toast, isBusy: () => hud.isActive() });
  // Projects in this browser. "חדש" (Alt+N) is "ניקוי מסך": start over, asking first about unsaved changes.
  // Not Alt+Shift: on Windows that switches the keyboard layout (Hebrew/English).
  const projects = createProjectsDialog({
    store, toast, newDesign: () => initial.design,
    onOpened: (kind) => { viewer.clearMeasurements(); hooks.onOpened?.(kind); }, // another project: its own measurements
  });
  byId('open-save').addEventListener('click', () => projects.open());
  byId('new-project').addEventListener('click', () => projects.startNew());
  byId('open-project').addEventListener('click', () => projects.open({ list: true }));
  // The customer's details (ADR-038): with the project, in the dossier, never sent to the agent.
  projectCustomer = projects.getCustomer;
  const customerDialog = createCustomerDialog({ getCustomer: projects.getCustomer, setCustomer: projects.setCustomer, toast });
  byId('open-customer').addEventListener('click', () => customerDialog.open());
  document.addEventListener('keydown', (event) => {
    const saveKey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyS';
    if (saveKey) event.preventDefault(); // never the browser's "Save page as", even over a dialog
    if (event.isComposing || document.querySelector('dialog[open]')) return;
    if (viewer.dragging) return; // a drag in 3D owns the keys until it ends (Escape cancels it)
    const typing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');
    if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyN' && !typing) {
      event.preventDefault();
      projects.startNew();
    } else if (event.code === 'KeyM' && !event.repeat && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      viewer.setMeasuring(!viewer.measuring); // the ruler on and off (ADR-040)
    } else if (NUDGE_KEYS[event.code] && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.defaultPrevented
      && !(event.target instanceof Element && event.target.closest('#properties-panel, #side-panel, [role="tab"], .topbar, header'))) {
      // The arrows move the selected part along its line (1 cm, Shift 10 cm), as a drag would (ADR-039); in the
      // panels they keep their own meaning (tabs, scrolling).
      const { design, selection } = store.getState();
      const target = targetForSelection(design, selection);
      const [key, sign] = NUDGE_KEYS[event.code];
      const ops = target && nudge(design, target, key, sign, event.shiftKey);
      if (!ops) return;
      event.preventDefault();
      const offset = design.room?.offset;
      const result = store.dispatch(ops, { coalesce: `nudge:${selection.id}` });
      if (!result.ok) toast(`לא הוזז: ${friendlyError(result.error)}`);
      else if (target.kind === 'wardrobe') viewer.followWardrobe(store.getState().design.room.offset - offset);
    } else if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyO' && !typing) {
      event.preventDefault();
      projects.open({ list: true });
    } else if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyS') {
      event.preventDefault();
      projects.save();
    }
  });
  app = { store, hud };
  removeLoading();
  // Compile the path tracer in the background so the first render starts at once. Not on a software
  // renderer: there the compile takes tens of seconds of CPU on every load (render still works on demand).
  if (!softwareRenderer()) (window.requestIdleCallback ?? setTimeout)(() => viewer.prewarm?.()?.catch?.(() => {}), { timeout: 3000 });

  // The OpenAI key stays in this browser; the backend only checks it. load() re-checks a stored key.
  const keyStorage = createKeyStorage();
  const aiSettings = createAiSettingsModel({ storage: keyStorage, verify: (apiKey) => verifyAiKey(apiKey) });
  // The session language (ADR-029): remembered in this browser; the chat column, the agent, transcription
  // and the spoken voice follow it, and the dossier menu marks it as the default.
  setChatLanguage(loadChatLanguage());
  const markDossierLanguage = (lang) => document.querySelectorAll('.dossier-menu [data-lang]').forEach((option) => {
    option.setAttribute('aria-current', String(option.dataset.lang === lang));
  });
  markDossierLanguage(getChatLanguage());
  onChatLanguage((lang) => {
    saveChatLanguage(lang);
    markDossierLanguage(lang);
  });

  // Spoken replies (ADR-028): made on the server with the customer's key, played here.
  const speechPrefs = createSpeechPrefs();
  const speaker = createSpeaker({
    synthesize: (text, voice, { signal } = {}) => {
      const apiKey = keyStorage.get();
      if (!apiKey) return Promise.reject(Object.assign(new Error('no key'), { code: 'INVALID_FORMAT' }));
      return synthesizeSpeech(apiKey, text, voice, { signal });
    },
    onError: (error) => toast(speechErrorMessage(error?.code)),
  });
  const speech = { prefs: speechPrefs, speaker };
  const settingsDialog = createAiSettingsDialog(aiSettings, { speech });
  byId('open-ai-settings').addEventListener('click', settingsDialog.open);
  aiSettings.load();
  // Tools · health check: the planning server, then the AI key (re-checked, as load() does).
  const AI_STATUS_TEXT = {
    connected: 'מפתח ה-AI תקין', not_configured: 'מפתח AI עדיין לא הוגדר', invalid_key: 'מפתח ה-AI לא תקין',
    model_unavailable: 'מפתח ה-AI תקין אבל המודל לא זמין', unreachable: 'שירות ה-AI לא ענה',
  };
  byId('check-health').addEventListener('click', async () => {
    toast('בודק את החיבור…');
    try {
      await getHealth();
    } catch {
      toast('אין חיבור לשרת התכנון. בדקו את החיבור לרשת.');
      return;
    }
    await aiSettings.load();
    toast(`השרת תקין · ${AI_STATUS_TEXT[aiSettings.getState().status] ?? 'מצב מפתח ה-AI לא ידוע'}`);
  });

  // The agent sends the browser-held key with each turn; the server never stores it. It sees the
  // committed design and may return a signed proposal (ADR-020), shown as a card the customer confirms.
  const agent = {
    isReady: () => keyStorage.get() !== null && aiSettings.getState().status !== 'invalid_key',
    reply: async (history, { spoken = false } = {}) => {
      speaker.stop(); // a new question ends the previous answer
      const { design, revision } = store.getState();
      const data = await sendChatMessage(keyStorage.get(), history, { design, revision, spoken, language: getChatLanguage() });
      if (spoken && speechPrefs.isEnabled()) speaker.speak(data.reply, speechPrefs.getVoice());
      const proposal = data.proposal ? await previewProposal(data.proposal, design, catalog) : null;
      const sources = data.sources ?? []; // the web pages the reply cites (shown under it, never spoken)
      return proposal ? { reply: data.reply, proposal, sources } : { reply: data.reply, sources };
    },
  };
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent });
  // Confirm: the server checks the signature and that the design is exactly the one the proposal was
  // made for (409 STALE otherwise), applies it, and the store adopts the result as one undo step.
  const chat = mountChat(byId('chat-body'), {
    model: chatModel,
    onConfirm: async (proposal) => {
      const { design, revision } = store.getState();
      try {
        if (!proposal.signed) throw Object.assign(new Error('unsigned'), { code: 'BAD_SIGNATURE' });
        const data = await applyProposal(design, revision, proposal.signed);
        store.adopt(data.design, data.revision);
        chatModel.resolveProposal(ct('אושר והוחל. אפשר לבטל עם Ctrl+Z.'));
      } catch (error) {
        let message = 'לא הצלחנו להחיל את ההצעה. התכנון לא השתנה.';
        if (error?.code === 'STALE') message = 'התכנון השתנה מאז ההצעה, ולכן היא לא הוחלה. בקשו הצעה חדשה.';
        else if (error?.code === 'BUSY') message = 'השרת עסוק ולא החיל את ההצעה. התכנון לא השתנה; בקשו אותה שוב בעוד רגע.';
        chatModel.resolveProposal(ct(message));
      }
    },
    aiSettings,
    onOpenSettings: settingsDialog.open,
    // Push-to-talk (ADR-021): the recording goes to the server with the browser-held key and comes back
    // as text, which is sent like a typed message. Without a key nothing is uploaded.
    speech,
    voice: (mic, { input, send }) => {
      // Talking over בנאי ends the current answer: a press on the mic, or Space / Enter on it.
      mic.addEventListener('pointerdown', () => speaker.stop());
      mic.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') speaker.stop();
      });
      return bindPushToTalk(mic, {
        input,
        send,
        toast,
        transcribe: (audio) => {
          const apiKey = keyStorage.get();
          if (!apiKey) return Promise.reject(Object.assign(new Error('no key'), { code: 'INVALID_FORMAT' }));
          return transcribeAudio(apiKey, audio, { language: getChatLanguage() });
        },
      });
    },
  });
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel, aiSettings, feed, hud, alerts, projects });
  }

  byId('open-about')?.addEventListener('click', () => openAboutDialog({ reducedMotion: reducedMotion() }));
  const showStart = () => mountStartScreen({
    reducedMotion: reducedMotion(),
    // A software renderer draws the start screen's wardrobe once instead of animating it.
    still: softwareRenderer(),
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also open the chat tab.
      if (entry.id === 'basic') return;
      tabs.closeAdvice();
      chat.focus(entry.composerHint);
    },
  });
  hooks.askBob = (text) => {
    tabs.closeAdvice(); // the question is written into the chat, which is always there
    chat.draft(text);
  };
  // A shared link (#d=<id>.<token>) opens that project instead of the start screen.
  const sharedLink = parseShareHash(globalThis.location.hash);
  hooks.onOpened = (kind) => {
    chatModel.clear();
    alerts.reset();
    tabs.closeAdvice();
    if (kind === 'new') showStart(); // a fresh start begins where a visit begins
    else toast('הפרויקט נפתח');
  };
  if (sharedLink && await projects.openShared(sharedLink)) return;
  if (sharedLink) toast('לא הצלחנו לפתוח את הפרויקט מהקישור');
  showStart();
}

boot().catch(() => {
  showError('לא הצלחנו להפעיל את התכנון. רעננו את הדף.');
});
