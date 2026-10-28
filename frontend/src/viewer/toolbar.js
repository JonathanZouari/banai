// Floating toolbar over the 3D view: switch between the closed wardrobe (doors) and its interior,
// Door visibility is UI state only; it never changes the design.
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

  const toolbar = el('div', { className: 'viewer-toolbar' }, [group]);
  toolbar.dataset.testid = 'viewer-toolbar';
  container.append(toolbar);

  const sync = () => {
    const showingDoors = store.getState().ui.doorsVisible;
    doors.setAttribute('aria-checked', String(showingDoors));
    interior.setAttribute('aria-checked', String(!showingDoors));
    moveIndicator();
  };
  // Park the sliding highlight behind the active option (offsets are physical, so this holds in RTL too).
  const moveIndicator = () => {
    const active = doors.getAttribute('aria-checked') === 'true' ? doors : interior;
    if (!active.offsetWidth) return; // not laid out yet; the next call places it
    group.style.setProperty('--x', `${active.offsetLeft}px`);
    group.style.setProperty('--w', `${active.offsetWidth}px`);
  };
  const relabel = () => {
    doors.lastChild.textContent = t('uiViewDoors');
    interior.lastChild.textContent = t('uiViewInterior');
    group.setAttribute('aria-label', t('uiViewAria'));
    toolbar.dir = language.dir();
    moveIndicator(); // labels change the button widths
  };
  store.subscribe(sync);
  language.subscribe(relabel);
  sync();
  relabel();
  // Enable the slide only after the first placement, so the highlight does not fly in on load.
  requestAnimationFrame(() => { moveIndicator(); requestAnimationFrame(() => group.classList.add('view-switch--ready')); });
  return toolbar;
}
