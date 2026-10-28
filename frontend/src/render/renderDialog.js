// Photorealistic render dialog. Rendering needs the backend image service (Phase 8), so the action
// is disabled and says so. The image is always labelled as illustrative, never as the accurate model.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';
import { strings } from '../ui/i18n.js';

export function createRenderDialog() {
  const t = strings();
  const placeholder = el('div', { className: 'render__placeholder' }, [icon('image', { size: 48 }), el('span', { text: t.renderPlaceholder })]);
  const dialog = createDialog({
    title: t.renderTitle,
    labelId: 'render-dialog-title',
    testId: 'render-dialog',
    body: [
      el('p', { className: 'dialog__text', text: t.renderText }),
      placeholder,
      el('span', { className: 'chip', text: t.renderDisclaimer }),
      el('p', { className: 'dialog__status', text: t.renderUnavailable, attrs: { role: 'status' } }),
    ],
    actions: [
      button(t.generateRender, () => {}, { variant: 'primary', testId: 'render-generate', disabled: true }),
      button(t.close, () => dialog.close(), { variant: 'ghost', testId: 'render-close' }),
    ],
  });
  return dialog;
}
