// The unit selector in the top bar: cm | mm | in. It changes how lengths are displayed only;
// it never imports or calls the store.
import { el } from '../editor/fields.js';
import { UNITS } from './displayUnits.js';

/**
 * Fill `container` with the unit buttons and keep them in step with `units`. `label` and `names()` give
 * the UI language's group label and unit names (English codes when omitted). Returns a cleanup function;
 * its `refresh()` re-reads the texts after a UI language change.
 */
export function createUnitSelector({ container, units, label = 'Units', names = () => ({}) }) {
  const labelOf = typeof label === 'function' ? label : () => label;
  const group = el('div', { className: 'unit-selector', attrs: { role: 'group', 'aria-label': labelOf(), 'data-testid': 'unit-selector' } });
  const buttons = new Map();
  UNITS.forEach((unit) => {
    const button = el('button', { className: 'unit-selector__option', text: names()[unit] ?? unit, attrs: { type: 'button', 'data-testid': `unit-${unit}`, 'aria-pressed': 'false' } });
    button.addEventListener('click', () => units.set(unit));
    buttons.set(unit, button);
    group.append(button);
  });
  const render = () => buttons.forEach((button, unit) => button.setAttribute('aria-pressed', String(unit === units.get())));
  render();
  const unsubscribe = units.subscribe(render);
  container.replaceChildren(group);
  const cleanup = () => { unsubscribe(); group.remove(); };
  cleanup.refresh = () => {
    group.setAttribute('aria-label', labelOf());
    buttons.forEach((button, unit) => { button.textContent = names()[unit] ?? unit; });
  };
  return cleanup;
}
