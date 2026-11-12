// Photorealistic render dialog. It sends the committed design and the app's own studio snapshot of
// it to the backend, which asks the image model for an illustrative photo. The design is never
// changed, and the image is always labelled as illustrative, never as the accurate model.
import { el, button } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createDialog } from '../ui/dialog.js';
import { requestRender } from '../api/client.js';

export const RENDER_DISCLAIMER = 'Illustrative image, not the accurate 3D model';
// The same portrait size the backend asks the image model for.
export const RENDER_SNAPSHOT_SIZE = Object.freeze({ width: 1024, height: 1536 });
const UNAVAILABLE = 'Rendering is not available on this server.';
const FAILED = 'The image could not be created. Please try again.';
const WORKING = 'Creating your image. This usually takes 20 to 60 seconds…';
const DONE = 'Your image is ready.';

function downloadDataUrl(dataUrl, filename) {
  const link = el('a', { attrs: { href: dataUrl, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * getState() returns the committed { design, catalog } (never a pending proposal); getSnapshot(design)
 * returns the studio picture as a data URL, or throws when WebGL is unavailable.
 */
export function createRenderDialog({ available = false, getState, getLanguage, getSnapshot, renderImpl = requestRender } = {}) {
  let busy = false;
  let image = null;
  const placeholderLabel = el('span', { text: 'Your render will appear here' });
  const placeholder = el('div', { className: 'render__placeholder' }, [icon('image', { size: 48 }), placeholderLabel]);
  placeholder.dataset.testid = 'render-preview';
  const status = el('p', { className: 'dialog__status', text: available ? '' : UNAVAILABLE, attrs: { role: 'status' } });
  status.dataset.testid = 'render-status';

  function showImage(dataUrl, design) {
    const { width, height, depth } = design.dimensions;
    const picture = el('img', {
      className: 'render__image',
      attrs: { src: dataUrl, alt: `Illustrative photo of the wardrobe, ${width / 10} × ${height / 10} × ${depth / 10} cm` },
    });
    picture.dataset.testid = 'render-image';
    placeholder.replaceChildren(picture);
    placeholder.classList.add('render__placeholder--image');
  }

  const download = button('Download image', () => {
    if (image) downloadDataUrl(image.dataUrl, image.filename);
  }, { variant: 'tonal', testId: 'render-download', disabled: true });

  const generate = button('Generate render', async () => {
    if (busy || !available) return;
    busy = true;
    generate.disabled = true;
    placeholder.setAttribute('aria-busy', 'true');
    placeholder.classList.add('render__placeholder--working');
    placeholderLabel.textContent = 'Creating…';
    status.textContent = WORKING;
    try {
      const { design, catalog } = getState(); // the committed design only
      let snapshot;
      try {
        snapshot = getSnapshot(design, catalog);
      } catch {
        throw new Error('This browser could not draw the 3D picture needed for the render.');
      }
      const result = await renderImpl({ design, image: snapshot, language: getLanguage() });
      const { width, height, depth } = design.dimensions;
      image = { dataUrl: result.image, filename: `banai-render-${width}x${height}x${depth}mm.jpg` };
      showImage(result.image, design);
      download.disabled = false;
      status.textContent = DONE;
    } catch (error) {
      if (!image) placeholderLabel.textContent = 'Your render will appear here';
      status.textContent = error?.message || FAILED;
    } finally {
      busy = false;
      generate.disabled = false;
      placeholder.removeAttribute('aria-busy');
      placeholder.classList.remove('render__placeholder--working');
    }
  }, { variant: 'primary', testId: 'render-generate', disabled: !available });

  const dialog = createDialog({
    title: 'Photorealistic render',
    labelId: 'render-dialog-title',
    testId: 'render-dialog',
    body: [
      el('p', { className: 'dialog__text', text: 'Create an illustrative image of your wardrobe on a clean background. Your design and its dimensions are not changed.' }),
      placeholder,
      el('span', { className: 'chip', text: RENDER_DISCLAIMER }),
      status,
    ],
    actions: [
      generate,
      download,
      button('Close', () => dialog.close(), { variant: 'ghost', testId: 'render-close' }),
    ],
  });
  return dialog;
}
