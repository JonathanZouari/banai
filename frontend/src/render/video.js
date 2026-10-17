// Demo video of the design: the open sequence (doors, then drawers, racks and the pull-down) under
// a slow camera orbit, encoded frame by frame with WebCodecs (Mediabunny). Every frame carries an
// explicit timestamp, so a slow frame never changes the timing: the same recorder can take a
// path-traced frame that needs seconds. H.264 in MP4 where the browser can encode it, else WebM.
import {
  BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeVideo,
} from 'mediabunny';
import { TRACED_VIDEO, VIDEO, poseAt, videoFrames } from './videoPlan.js';

export const VIDEO_ERRORS = Object.freeze({
  unsupported: 'הדפדפן הזה לא תומך בהקלטת וידאו (WebCodecs).',
  noCodec: 'הדפדפן הזה לא יכול לקודד וידאו בגודל הזה.',
  busy: 'אי אפשר להקליט עכשיו. סיימו את הרינדור ונסו שוב.',
});

const FORMATS = [
  ['avc', () => new Mp4OutputFormat(), 'mp4', 'video/mp4'],
  ['vp9', () => new WebMOutputFormat(), 'webm', 'video/webm'],
  ['vp8', () => new WebMOutputFormat(), 'webm', 'video/webm'],
];

/** The first codec this browser encodes at this size, with its container; null when none. */
export async function pickFormat(width, height) {
  for (const [codec, format, ext, mime] of FORMATS) {
    if (await canEncodeVideo(codec, { width, height })) return { codec, format: format(), ext, mime };
  }
  return null;
}

/**
 * Record the demo video. Returns { blob, ext, frames }. onProgress(done, total, secondsLeft) after each
 * frame; an aborted `signal` stops it (an AbortError). `traced` path-traces every frame (`samples` each)
 * instead of drawing the live view. The viewer gets its live view back either way.
 */
export async function recordVideo(viewer, design, { traced = false, ...options } = {}) {
  const base = traced ? TRACED_VIDEO : VIDEO;
  const {
    width = base.width, height = base.height, seconds = base.seconds, fps = base.fps, samples = TRACED_VIDEO.samples,
    onProgress, signal,
  } = options;
  if (typeof VideoEncoder === 'undefined') throw new Error(VIDEO_ERRORS.unsupported);
  const choice = await pickFormat(width, height);
  if (!choice) throw new Error(VIDEO_ERRORS.noCodec);
  const ready = traced ? await viewer.beginTracedCapture({ width, height }) : viewer.beginCapture({ width, height });
  if (!ready) throw new Error(VIDEO_ERRORS.busy);
  const output = new Output({ format: choice.format, target: new BufferTarget() });
  try {
    const source = new CanvasSource(viewer.canvas, { codec: choice.codec, quality: QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    const frames = videoFrames({ seconds, fps });
    const aspect = width / height;
    const started = performance.now();
    for (const frame of frames) {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      const pose = poseAt(design.dimensions, frame.u, { fov: viewer.camera.fov, aspect });
      if (traced) viewer.captureTracedFrame({ pose, motion: frame.motion, samples });
      else viewer.captureFrame({ pose, motion: frame.motion });
      await source.add(frame.timestamp, frame.duration);
      const done = frame.index + 1;
      const perFrame = (performance.now() - started) / 1000 / done;
      onProgress?.(done, frames.length, Math.round(perFrame * (frames.length - done)));
      if (traced) await new Promise((resolve) => { setTimeout(resolve, 0); }); // let the page breathe between heavy frames
    }
    await output.finalize();
    return { blob: new Blob([output.target.buffer], { type: choice.mime }), ext: choice.ext, frames: frames.length };
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    viewer.endCapture();
  }
}

const timeLeft = (seconds) => (seconds >= 90 ? `כ-${Math.round(seconds / 60)} דק׳` : `${seconds} שנ׳`);

/**
 * The video menu: "fast" records the live view, "photoreal" path-traces every frame (minutes; a GPU helps).
 * While recording, the menu button shows progress and a click on it cancels.
 */
export function bindVideoMenu(menu, { viewer, getDesign, toast, isBusy = () => false }) {
  const summary = menu.querySelector('summary');
  const label = summary.textContent;
  let controller = null;
  summary.addEventListener('click', (event) => {
    if (!controller) return;
    event.preventDefault(); // recording: the button cancels instead of opening the menu
    controller.abort();
  });
  document.addEventListener('pointerdown', (event) => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  menu.querySelectorAll('[data-video]').forEach((option) => option.addEventListener('click', () => {
    menu.open = false;
    record(option.dataset.video === 'traced');
  }));

  async function record(traced) {
    if (controller) return;
    if (isBusy()) {
      toast(VIDEO_ERRORS.busy);
      return;
    }
    controller = new AbortController();
    summary.setAttribute('aria-busy', 'true');
    summary.textContent = traced ? 'מכין רינדור…' : 'מקליט…';
    document.body.classList.add('is-capturing');
    try {
      const { blob, ext } = await recordVideo(viewer, getDesign(), {
        traced,
        signal: controller.signal,
        onProgress: (done, total, secondsLeft) => {
          const percent = Math.round((100 * done) / total);
          summary.textContent = traced ? `${percent}% · נשארו ${timeLeft(secondsLeft)} · ביטול` : `מקליט ${percent}% · ביטול`;
        },
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = traced ? `banai-video-render.${ext}` : `banai-video.${ext}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('הסרטון מוכן');
    } catch (error) {
      toast(error?.name === 'AbortError' ? 'ההקלטה בוטלה' : (error?.message || 'ההקלטה נכשלה'));
    } finally {
      controller = null;
      summary.removeAttribute('aria-busy');
      summary.textContent = label;
      document.body.classList.remove('is-capturing');
    }
  }
}
