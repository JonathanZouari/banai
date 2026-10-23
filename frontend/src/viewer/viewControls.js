// Floating camera buttons inside the 3D viewer: Front, Side, 3/4, Reset.
// They move the camera only. This module never imports or calls the store.
import { el } from '../editor/fields.js';

export const VIEW_BUTTONS = Object.freeze([
  { view: 'front', testId: 'view-front' },
  { view: 'side', testId: 'view-side' },
  { view: 'threeQuarter', testId: 'view-3q' },
  { view: 'reset', testId: 'view-reset' },
]);

export const VIEW_LABELS = Object.freeze({
  he: { group: 'זוויות מצלמה', front: 'חזית', side: 'צד', threeQuarter: '3/4', reset: 'איפוס' },
  en: { group: 'Camera angles', front: 'Front', side: 'Side', threeQuarter: '3/4', reset: 'Reset' },
});

/** Add the camera buttons to `container`; labels follow `language` (`get` / `subscribe`). Returns a cleanup function. */
export function createViewControls({ container, viewer, language }) {
  const group = el('div', { className: 'viewer-views', attrs: { role: 'group', 'data-testid': 'view-controls' } });
  const buttons = new Map();
  VIEW_BUTTONS.forEach(({ view, testId }) => {
    const button = el('button', { className: 'btn btn--tonal btn--small', attrs: { type: 'button', 'data-testid': testId, 'data-view': view } });
    button.addEventListener('click', () => viewer.setView(view));
    buttons.set(view, button);
    group.append(button);
  });

  const render = () => {
    const code = VIEW_LABELS[language.get()] ? language.get() : 'en';
    const labels = VIEW_LABELS[code];
    group.lang = code;
    group.setAttribute('aria-label', labels.group);
    buttons.forEach((button, view) => { button.textContent = labels[view]; });
  };
  render();
  const unsubscribe = language.subscribe(render);
  container.append(group);
  return () => { unsubscribe(); group.remove(); };
}
