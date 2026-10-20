// Floating toolbar over the 3D view: switch between the closed wardrobe (doors) and its interior,
// and reset the camera. Door visibility is UI state only; it never changes the design.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { language } from '../i18n/strings.js';

export function mountViewerToolbar(container, store, viewer) {
  const t = (key) => language.t(key);
  const option = (testId, iconName, onClick) => {
    const button = el('button', { className: 'view-switch__btn', attrs: { type: 'button', role: 'radio' } }, [icon(iconName, { size: 18 }), el('span')]);
    button.dataset.testid = testId;
    button.addEventListener('click', onClick);
    return button;
  };
  const doors = option('view-doors', 'doors', () => store.setDoorsVisible(true));
  const interior = option('view-interior', 'interior', () => store.setDoorsVisible(false));
  const group = el('div', { className: 'view-switch', attrs: { role: 'radiogroup' } }, [doors, interior]);

  const reset = el('button', { className: 'icon-btn viewer-toolbar__reset', attrs: { type: 'button' } }, [icon('reset', { size: 20 })]);
  reset.dataset.testid = 'reset-view';
  reset.addEventListener('click', () => viewer.resetView());

  const toolbar = el('div', { className: 'viewer-toolbar' }, [group, reset]);
  toolbar.dataset.testid = 'viewer-toolbar';
  container.append(toolbar);

  const sync = () => {
    const showingDoors = store.getState().ui.doorsVisible;
    doors.setAttribute('aria-checked', String(showingDoors));
    interior.setAttribute('aria-checked', String(!showingDoors));
  };
  const relabel = () => {
    doors.lastChild.textContent = t('uiViewDoors');
    interior.lastChild.textContent = t('uiViewInterior');
    group.setAttribute('aria-label', t('uiViewAria'));
    reset.setAttribute('aria-label', t('uiResetView'));
    reset.title = t('uiResetView');
    toolbar.dir = language.dir();
  };
  store.subscribe(sync);
  language.subscribe(relabel);
  sync();
  relabel();
  return toolbar;
}
