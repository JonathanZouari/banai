// Path-traced render (ADR-022), driven from the floating HUD in the viewer: a progress ring,
// "save image" when it converges, and "back to editing". The viewer owns the path tracer; this
// module only drives it and keeps the latest finished image for the carpenter dossier cover.

const RING = 69.12; // ring circumference: 2π · 11

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
