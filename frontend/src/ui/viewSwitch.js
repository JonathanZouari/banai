// "Designer | Room fit" switch in the top bar. Buttons with aria-pressed (keyboard operable).
import { el } from '../editor/fields.js';
import { t } from './i18n.js';

const VIEWS = Object.freeze(['designer', 'room']);

/** onChange(view) asks the router to show it; set(view) reflects the shown view; refresh() re-labels. */
export function createViewSwitch({ onChange }) {
  let current = 'designer';
  const group = el('div', { className: 'segmented view-switch', attrs: { role: 'group' } });
  group.dataset.testid = 'view-switch';
  const buttons = VIEWS.map((view) => {
    const option = el('button', { className: 'segmented__option', attrs: { type: 'button' } });
    option.dataset.testid = `view-${view}`;
    option.addEventListener('click', () => onChange(view));
    return option;
  });
  group.append(...buttons);
  const refresh = () => {
    const s = t().views;
    group.setAttribute('aria-label', s.label);
    buttons.forEach((option, index) => {
      option.textContent = s[VIEWS[index]];
      option.setAttribute('aria-pressed', String(VIEWS[index] === current));
    });
  };
  refresh();
  return {
    element: group,
    set(view) {
      current = view;
      refresh();
    },
    refresh,
  };
}
