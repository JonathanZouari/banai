// Room view (the centre column in the "Room fit" view): the customer's photo with an illustrative
// wardrobe layer on it. The layer is a transparent front-on render of the current design. It can be
// moved and resized by mouse, by keyboard (arrows, +/-) and with buttons (a single-pointer
// alternative to dragging, WCAG 2.5.7). It is always labelled as approximate and never measured.
import { el, button } from '../editor/fields.js';
import { t } from '../ui/i18n.js';
import { cutoutSize } from '../viewer/snapshot.js';
import { DEFAULT_OVERLAY, MOVE_STEP, moveOverlay, overlayForKey, RESIZE_FACTOR, resizeOverlay } from './overlayMath.js';

/**
 * store: the app store. photos: the photo store. render(design, catalog, size): a transparent PNG
 * data URL of the design (throws without WebGL). onDropFile(file): a photo dropped on the view.
 */
export function mountRoomStage(root, { store, photos, render, onDropFile }) {
  let overlay = { ...DEFAULT_OVERLAY };
  let cutout = { design: null, url: null, failed: false };
  let visible = false;
  let refreshTimer = null;

  const layer = el('img', { className: 'room-stage__layer', attrs: { alt: '', draggable: 'false' } });
  const layerBox = el('div', { className: 'room-stage__overlay', attrs: { tabindex: '0', role: 'group' } }, [layer]);
  layerBox.dataset.testid = 'room-overlay';

  const placeLayer = () => {
    layerBox.style.left = `${overlay.x * 100}%`;
    layerBox.style.top = `${overlay.y * 100}%`;
    layerBox.style.height = `${overlay.height * 100}%`;
    layerBox.dataset.x = overlay.x.toFixed(3);
    layerBox.dataset.y = overlay.y.toFixed(3);
    layerBox.dataset.height = overlay.height.toFixed(3);
  };
  const setOverlay = (next) => {
    overlay = next;
    placeLayer();
  };

  layerBox.addEventListener('keydown', (event) => {
    const next = overlayForKey(overlay, event.key);
    if (!next) return;
    event.preventDefault();
    setOverlay(next);
  });
  layerBox.addEventListener('pointerdown', (event) => {
    const area = root.querySelector('.room-stage__frame').getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, overlay };
    layerBox.setPointerCapture(event.pointerId);
    const move = (moveEvent) => setOverlay(moveOverlay(start.overlay, (moveEvent.clientX - start.x) / area.width, (moveEvent.clientY - start.y) / area.height));
    const end = () => {
      layerBox.removeEventListener('pointermove', move);
      layerBox.removeEventListener('pointerup', end);
      layerBox.removeEventListener('pointercancel', end);
    };
    layerBox.addEventListener('pointermove', move);
    layerBox.addEventListener('pointerup', end);
    layerBox.addEventListener('pointercancel', end);
  });

  /** Re-render the cut-out when the design changed (only while the view is shown and there is a photo). */
  function refreshCutout() {
    const { design, catalog } = store.getState();
    if (!visible || !photos.get() || cutout.design === design) return;
    try {
      cutout = { design, url: render(design, catalog, { ...cutoutSize(design, 600), transparent: true }), failed: false };
    } catch {
      cutout = { design, url: null, failed: true };
    }
    build();
  }
  const scheduleCutout = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshCutout, 150);
  };

  function controls() {
    const s = t().room;
    const make = (label, testId, next) => button(label, () => setOverlay(next()), { variant: 'secondary', testId });
    const group = el('div', { className: 'room-stage__controls', attrs: { role: 'group', 'aria-label': s.overlayControls } }, [
      make(s.move.up, 'overlay-up', () => moveOverlay(overlay, 0, -MOVE_STEP)),
      make(s.move.down, 'overlay-down', () => moveOverlay(overlay, 0, MOVE_STEP)),
      make(s.move.right, 'overlay-right', () => moveOverlay(overlay, MOVE_STEP, 0)),
      make(s.move.left, 'overlay-left', () => moveOverlay(overlay, -MOVE_STEP, 0)),
      make(s.bigger, 'overlay-bigger', () => resizeOverlay(overlay, RESIZE_FACTOR)),
      make(s.smaller, 'overlay-smaller', () => resizeOverlay(overlay, 1 / RESIZE_FACTOR)),
      make(s.resetOverlay, 'overlay-reset', () => ({ ...DEFAULT_OVERLAY })),
    ]);
    return group;
  }

  function build() {
    const s = t().room;
    const photo = photos.get();
    layerBox.setAttribute('aria-label', s.overlayAria);
    if (!photo) {
      const empty = el('div', { className: 'room-stage__empty' }, [el('p', { text: s.noPhoto }), el('p', { className: 'panel__note', text: s.photoDrop })]);
      empty.dataset.testid = 'room-stage-empty';
      root.replaceChildren(empty);
      return;
    }
    const image = el('img', { className: 'room-stage__photo', attrs: { src: photo.url, alt: s.photoAlt } });
    image.dataset.testid = 'room-photo';
    const frame = el('div', { className: 'room-stage__frame' }, [image]);
    frame.style.aspectRatio = `${photo.width} / ${photo.height}`;
    if (cutout.url) {
      layer.src = cutout.url;
      placeLayer();
      frame.append(layerBox);
    }
    const label = el('p', { className: 'chip room-stage__label', text: s.overlayLabel });
    label.dataset.testid = 'room-overlay-label';
    root.replaceChildren(
      label,
      frame,
      ...(cutout.failed ? [el('p', { className: 'panel__note', text: s.overlayUnavailable })] : []),
      ...(cutout.url ? [controls()] : []),
    );
  }

  // Drop a photo anywhere on the view.
  root.addEventListener('dragover', (event) => { event.preventDefault(); });
  root.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) onDropFile(file);
  });

  photos.subscribe(() => {
    if (!photos.get()) overlay = { ...DEFAULT_OVERLAY };
    cutout = { ...cutout, design: null }; // a new photo: draw the layer for it
    build();
    scheduleCutout();
  });
  store.subscribe(scheduleCutout);
  build();

  return {
    show() {
      visible = true;
      build();
      scheduleCutout();
    },
    hide() { visible = false; },
    refresh: build,
  };
}
