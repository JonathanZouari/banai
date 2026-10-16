import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import { getCatalog, getDefaultDesign } from './api/client.js';
import { createStore } from './state/store.js';
import { mountPanel } from './editor/panel.js';
import { createViewer } from './viewer/viewer.js';

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

function bindInteriorToggle(store) {
  const toggle = document.getElementById('toggle-interior');
  toggle.addEventListener('change', () => store.setDoorsVisible(!toggle.checked));
  store.subscribe((state) => { toggle.checked = !state.ui.doorsVisible; });
}

function bindViewToolbar(viewer) {
  const buttons = document.querySelectorAll('.viewer-toolbar__btn[data-view]');
  buttons.forEach((button) => button.addEventListener('click', () => {
    viewer.setView(button.dataset.view);
    buttons.forEach((other) => other.classList.toggle('is-active', other === button));
  }));
  document.querySelector('.viewer-toolbar__btn[data-fit]').addEventListener('click', () => viewer.fit());
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
  bindViewToolbar(viewer);
  mountPanel(document.getElementById('properties-content'), store);
  if (import.meta.env.DEV) {
    window.__banai = Object.freeze({ store, viewer });
  }
}

boot().catch(() => {
  showError('The designer could not start. Please reload the page.');
});
