// Demo video of the design: the open sequence (doors, then drawers, racks and the pull-down) under
// a slow camera orbit, encoded frame by frame with WebCodecs (Mediabunny). Every frame carries an
// explicit timestamp, so a slow frame never changes the timing: the same recorder can take a
// path-traced frame that needs seconds. H.264 in MP4 where the browser can encode it, else WebM.
import {
  BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeVideo,
} from 'mediabunny';
import { VIDEO, poseAt, videoFrames } from './videoPlan.js';

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
 * Record the demo video. Returns { blob, ext, frames }. onProgress(done, total) after each frame;
 * an aborted `signal` stops it (an AbortError). The viewer gets its live view back either way.
 */
export async function recordVideo(viewer, design, {
  width = VIDEO.width, height = VIDEO.height, seconds = VIDEO.seconds, fps = VIDEO.fps, onProgress, signal,
} = {}) {
  if (typeof VideoEncoder === 'undefined') throw new Error(VIDEO_ERRORS.unsupported);
  const choice = await pickFormat(width, height);
  if (!choice) throw new Error(VIDEO_ERRORS.noCodec);
  if (!viewer.beginCapture({ width, height })) throw new Error(VIDEO_ERRORS.busy);
  const output = new Output({ format: choice.format, target: new BufferTarget() });
  try {
    const source = new CanvasSource(viewer.canvas, { codec: choice.codec, quality: QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    const frames = videoFrames({ seconds, fps });
    const aspect = width / height;
    for (const frame of frames) {
      if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
      viewer.captureFrame({ pose: poseAt(design.dimensions, frame.u, { fov: viewer.camera.fov, aspect }), motion: frame.motion });
      await source.add(frame.timestamp, frame.duration);
      onProgress?.(frame.index + 1, frames.length);
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

/**
 * The "סרטון" button: records, shows progress on itself, downloads the file. A second click cancels.
 */
export function bindVideoButton(button, { viewer, getDesign, toast, isBusy = () => false }) {
  let controller = null;
  const label = button.textContent;
  button.addEventListener('click', async () => {
    if (controller) {
      controller.abort();
      return;
    }
    if (isBusy()) {
      toast(VIDEO_ERRORS.busy);
      return;
    }
    controller = new AbortController();
    button.setAttribute('aria-busy', 'true');
    document.body.classList.add('is-capturing');
    try {
      const { blob, ext } = await recordVideo(viewer, getDesign(), {
        signal: controller.signal,
        onProgress: (done, total) => { button.textContent = `מקליט ${Math.round((100 * done) / total)}% · ביטול`; },
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `banai-video.${ext}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('הסרטון מוכן');
    } catch (error) {
      toast(error?.name === 'AbortError' ? 'ההקלטה בוטלה' : (error?.message || 'ההקלטה נכשלה'));
    } finally {
      controller = null;
      button.removeAttribute('aria-busy');
      button.textContent = label;
      document.body.classList.remove('is-capturing');
    }
  });
}
