// Path-traced render (ADR-022), driven from the floating HUD in the viewer: a progress ring,
// "save image" when it converges, and "back to editing". The viewer owns the path tracer; this
// module only drives it and keeps the latest finished image for the carpenter dossier cover.

const RING = 69.12; // ring circumference: 2π · 11

export const COVER_MAX_SIDE = 1600; // matches the server's cover size (backend/app/api/dossier.py)
export const COVER_MAX_BYTES = 1.8 * 1024 * 1024; // under the server's 2 MiB PNG cap

const pngBytes = (dataUrl) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

/**
 * The render scaled to fit COVER_MAX_SIDE and COVER_MAX_BYTES, as a PNG data URL: a HiDPI render can
 * pass the server's cap, and the cover never needs more. A noisy image compresses badly, so the size
 * steps down until it fits (or gives up and returns the smallest). Decodes from bytes, not an <img>.
 */
export async function coverPng(dataUrl, { maxSide = COVER_MAX_SIDE, maxBytes = COVER_MAX_BYTES } = {}) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  let side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
  let result = dataUrl;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = side / Math.max(bitmap.width, bitmap.height);
      if (scale >= 1 && pngBytes(dataUrl) <= maxBytes) return dataUrl;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
      canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL('image/png');
      if (pngBytes(result) <= maxBytes) return result;
      side = Math.round(side * 0.7);
    }
    return result;
  } finally {
    bitmap.close();
  }
}

export function createRenderHud({ hud, viewer, toast }) {
  const bar = hud.querySelector('.ring-bar');
  const title = hud.querySelector('.hud-title');
  const sub = hud.querySelector('.hud-sub');
  const save = hud.querySelector('[data-action="save"]');
  const exit = hud.querySelector('[data-action="exit"]');
  let active = false;
  let latestImage = null;
  let started = 0;

  const progress = (samples, total, compiling) => {
    bar.style.strokeDashoffset = String(RING * (1 - Math.min(1, samples / total)));
    if (compiling) {
      sub.textContent = 'מכין את מנוע הרינדור (רק בפעם הראשונה)…';
      return;
    }
    const done = samples >= total;
    hud.classList.toggle('is-done', done);
    save.hidden = !done;
    if (done) {
      title.textContent = 'הרינדור מוכן';
      sub.textContent = `${total} דגימות · ${Math.round((performance.now() - started) / 1000)} שנ׳ · נאמן לגיאומטריה`;
      latestImage = viewer.snapshot?.() ?? latestImage;
    } else {
      title.textContent = 'רינדור פוטוריאליסטי';
      sub.textContent = `${samples} מתוך ${total} דגימות · אפשר לסובב`;
    }
  };

  function stop() {
    if (!active) return;
    active = false;
    viewer.stopRender?.();
    document.body.classList.remove('is-rendering');
    hud.hidden = true;
  }

  async function start() {
    if (active) return;
    if (typeof viewer.startRender !== 'function') {
      toast('הרינדור לא זמין כרגע');
      return;
    }
    active = true;
    started = performance.now();
    document.body.classList.add('is-rendering');
    hud.hidden = false;
    hud.classList.remove('is-done');
    save.hidden = true;
    title.textContent = 'רינדור פוטוריאליסטי';
    sub.textContent = 'טוען מנוע רינדור…';
    bar.style.strokeDashoffset = String(RING);
    try {
      await viewer.startRender({ onProgress: progress });
    } catch (error) {
      toast(error?.message || 'הרינדור נכשל בדפדפן הזה');
      stop();
    }
  }

  save.addEventListener('click', () => {
    const href = viewer.snapshot?.();
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.download = 'banai-render.png';
    link.click();
  });
  exit.addEventListener('click', stop);

  return {
    start,
    stop,
    isActive: () => active,
    /** The last converged render as a PNG data URL, or null (used for the dossier cover). */
    latestImage: () => latestImage,
    /** A design change makes the finished image stale. */
    invalidate: () => { latestImage = null; },
  };
}
