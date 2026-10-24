// Photorealistic render dialog. Rendering needs the backend image service (Phase 8), so the action
// is disabled and says so. The image is always labelled as illustrative, never as the accurate model.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';
import { t } from '../ui/i18n.js';

export function createRenderDialog() {
  const s = t().dialogs.render;
  const placeholder = el('div', { className: 'render__placeholder' }, [icon('image', { size: 48 }), el('span', { text: s.placeholder })]);
  const dialog = createDialog({
    title: s.title,
    labelId: 'render-dialog-title',
    testId: 'render-dialog',
    body: [
      el('p', { className: 'dialog__text', text: s.intro }),
      placeholder,
      el('span', { className: 'chip', text: s.disclaimer }),
      el('p', { className: 'dialog__status', text: s.unavailable, attrs: { role: 'status' } }),
    ],
    actions: [
      button(s.generate, () => {}, { variant: 'primary', testId: 'render-generate', disabled: true }),
      button(t().dialogs.close, () => dialog.close(), { variant: 'ghost', testId: 'render-close' }),
    ],
  });
  return dialog;
}
