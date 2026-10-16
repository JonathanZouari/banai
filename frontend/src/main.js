import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { getCatalog, getDefaultDesign } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';

function showError(message) {
  document.body.classList.remove('is-loading');
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

function bindInteriorToggle(store) {
  const toggle = document.getElementById('toggle-interior');
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
}

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
  const viewer = createViewer(document.getElementById('viewer'), store);
  bindInteriorToggle(store);
  document.getElementById('reset-view').addEventListener('click', () => viewer.resetView());
  const properties = document.getElementById('properties-content');
  properties.classList.add('is-intro'); // cascade the cards in once, not on every edit
  mountPanel(properties, store);
  setTimeout(() => properties.classList.remove('is-intro'), 1400);
  document.body.classList.remove('is-loading');
  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer });
  }
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
