// Handle style + finish controls, shared by the Wardrobe section ("Handles", target 'all') and
// by the selected door or drawer (a per-item override of the wardrobe handles).
import { button, el, segmented, selectField } from './fields.js';
import { HANDLE_FINISH_OPTIONS, HANDLE_STYLE_OPTIONS, clearHandleOps, handleOps } from './opsFromForm.js';

/**
 * @param {object} options
 * @param {string} options.label      Group heading and accessible name ("Handles", "Door handle", …).
 * @param {string} options.testPrefix `handles`, `door-handle` or `drawer-handle`: test ids are
 *                                    `<prefix>-style`, `<prefix>-finish` and `<prefix>-reset`.
 * @param {string} options.target     `all`, a door id or a drawer id (the `set_handles` target).
 * @param {{style: string, finish: string}} options.inherited  The wardrobe handles.
 * @param {{style: string, finish: string}|null} [options.override]  The item's own handle, or
 *        null when it follows the wardrobe. Omit for the wardrobe group itself.
 * @param {(ops: object[]) => unknown} options.run  Dispatches ops (and reports a rejection).
 */
export function handleControls({ label, testPrefix, target, inherited, override, run }) {
  const isItem = override !== undefined;
  const current = override ?? inherited;
  const nodes = [
    el('p', { className: 'appearance__label', text: label }),
    selectField({
      label: 'סגנון',
      testId: `${testPrefix}-style`,
      value: current.style,
      options: HANDLE_STYLE_OPTIONS,
      onChange: (style) => run(handleOps(target, { style })),
    }),
    segmented({
      label: 'גימור',
      testId: `${testPrefix}-finish`,
      value: current.finish,
      options: HANDLE_FINISH_OPTIONS,
      onChange: (finish) => run(handleOps(target, { finish })),
    }),
  ];
  if (isItem && override) {
    nodes.push(button('חזרה לידיות הארון', () => run(clearHandleOps(target)), { variant: 'ghost', testId: `${testPrefix}-reset` }));
  } else if (isItem) {
    nodes.push(el('p', { className: 'handle-group__note', text: 'לפי ידיות הארון.' }));
  }
  return el('div', { className: 'appearance handle-group', attrs: { role: 'group', 'aria-label': label, 'data-group': label } }, nodes);
}
