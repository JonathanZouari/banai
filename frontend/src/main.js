import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import { applyProposal, getCatalog, getDefaultDesign, getHealth, sendChat } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';
import { createChatModel } from './chat/chatModel.js';
import { createLanguage } from './chat/i18n.js';
import { mountChat } from './chat/chatPanel.js';
import { mountStartScreen } from './entry/startScreen.js';
import { createSaveDialog } from './share/saveDialog.js';
import { createRenderDialog } from './render/renderDialog.js';
import { createLogo } from './ui/logo.js';
import { installRipple } from './ui/ripple.js';
import { mountRoomControls } from './ui/roomControls.js';
import { mountShell } from './ui/shell.js';
import { mountStructureNav } from './ui/structureNav.js';
import { labelOf } from './ui/naming.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

function bindDialogs() {
  const save = createSaveDialog();
  const render = createRenderDialog();
  document.getElementById('open-save').addEventListener('click', save.open);
  document.getElementById('open-render').addEventListener('click', render.open);
}

/**
 * Show the chat's pending proposal in 3D. The proposal is dry-run on a copy of the committed
 * design (store.proposeChanges); the committed design only changes when the customer confirms.
 */
function linkProposalPreview(chatModel, store) {
  let previewed = null;
  return () => {
    const proposal = chatModel.getProposal();
    const pending = proposal?.signed && chatModel.getProposalStatus() === 'pending' ? proposal : null;
    if (pending && pending.id !== previewed) {
      previewed = pending.id;
      const staged = store.proposeChanges({ ops: pending.signed.ops, summary: pending.summary, signed: pending.signed });
      // Interior changes would be hidden behind closed doors: show the inside for the preview.
      const preview = store.getState().proposal;
      const interior = staged.ok && (preview.replaces || [...preview.diff.added, ...preview.diff.modified, ...preview.diff.removed]
        .some((id) => !id.startsWith('dr_') && id !== 'carcass'));
      if (interior && store.getState().ui.doorsVisible) store.setDoorsVisible(false);
    } else if (!proposal && previewed) {
      previewed = null;
      if (store.getState().proposal) store.cancelProposal();
    }
  };
}

async function boot() {
  document.getElementById('topbar-logo').append(createLogo({ size: 32 }));
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
  mountPanel(document.getElementById('properties-content'), store, { headingRoot: document.getElementById('inspector-heading') });
  bindDialogs();

  // The agent is optional: without an OpenAI key on the server the panel says so honestly.
  const agent = health?.data.agent === true
    ? ({ messages, language: chatLanguage }) => {
      const { design, revision, selection } = store.getState();
      // The selected part is sent along, so "move this 15 cm higher" refers to it.
      const selected = selection && selection.kind !== 'carcass' ? { id: selection.id, kind: selection.kind } : null;
      return sendChat({ messages, design, revision, language: chatLanguage, ...(selected && { selection: selected }) });
    }
    : null;
  const language = createLanguage();
  const chatModel = createChatModel({ getRevision: () => store.getState().revision, agent, getLanguage: language.get });
  const t = () => language.strings();

  let applying = false;
  const confirmProposal = async (proposal = chatModel.getProposal()) => {
    if (!proposal || applying) return;
    if (!proposal.signed) {
      chatModel.resolveProposal(t().notApplied);
      return;
    }
    applying = true;
    const { design, revision } = store.getState();
    try {
      const result = await applyProposal({ design, revision, proposal: proposal.signed, language: language.get() });
      // Commit the server's design through the staged proposal (one undo step, preview cleared).
      // A manual edit made while the request was in flight still wins (STALE).
      const staged = store.getState().proposal?.signed === proposal.signed;
      const committed = staged
        ? store.applyProposal({ serverDesign: result.design })
        : (store.replaceDesign(result.design, result.revision), { ok: true });
      chatModel.resolveProposal(committed.ok ? t().applied : t().stale);
    } catch (error) {
      if (error?.code === 'STALE') store.markProposalStale();
      chatModel.resolveProposal(error?.code === 'STALE' ? t().stale : t().notApplied);
    } finally {
      applying = false;
    }
  };
  const getContext = () => {
    const { design, selection } = store.getState();
    if (!agent || !selection || selection.kind === 'carcass') return null;
    return { label: labelOf(design, selection.id), clear: () => store.select(null) };
  };
  const chat = mountChat(document.getElementById('chat-panel'), { model: chatModel, onConfirm: confirmProposal, language, getContext });
  chatModel.subscribe(linkProposalPreview(chatModel, store));
  // A manual edit changes the revision, which may turn a pending proposal stale.
  store.subscribe(() => chat.refresh());

  const shell = mountShell({ store, viewer, onApplyProposal: () => confirmProposal(), onCancelProposal: () => chatModel.cancelProposal() });
  mountRoomControls(document.getElementById('viewer-reset'), store);
  mountStructureNav(document.getElementById('structure-nav'), store);

  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer, chat: chatModel });
  }

  mountStartScreen({
    onChoose: (entry) => {
      // All three entry points open the same editor; the chat ones also open the assistant.
      if (entry.focusesChat) {
        shell.panels.open('left');
        shell.tabs.show('ai');
        chat.focus(entry.id);
      }
    },
  });
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
