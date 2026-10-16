// Microphone recorder (MediaRecorder). Never sends anything itself: it only returns a Blob.
// The mic is released after every recording, after a cancel and after an error.
const MIME_CANDIDATES = Object.freeze(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']);

export class VoiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function pickMimeType(MediaRecorderImpl) {
  if (!MediaRecorderImpl) return null;
  if (typeof MediaRecorderImpl.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((type) => MediaRecorderImpl.isTypeSupported(type)) ?? null;
}

export function createRecorder({
  maxSeconds = 20,
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderImpl = globalThis.MediaRecorder,
} = {}) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let timer = null;
  let mimeType = '';
  let pending = false; // waiting for the permission prompt
  let cancelledWhilePending = false;

  const release = () => {
    clearTimeout(timer);
    timer = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    recorder = null;
    chunks = [];
  };

  const cancelRecording = () => {
    if (recorder) {
      recorder.onstop = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
    }
    release();
  };

  return {
    isSupported: () => Boolean(mediaDevices?.getUserMedia && MediaRecorderImpl && pickMimeType(MediaRecorderImpl) !== null),
    isRecording: () => recorder !== null,

    /** Starts recording. `onAutoStop` runs once if the time limit ends the recording. */
    async start(onAutoStop) {
      if (recorder) return;
      if (!mediaDevices?.getUserMedia || !MediaRecorderImpl || pickMimeType(MediaRecorderImpl) === null) {
        throw new VoiceError('UNSUPPORTED', 'Voice input is not supported in this browser.');
      }
      pending = true;
      cancelledWhilePending = false;
      try {
        stream = await mediaDevices.getUserMedia({ audio: true });
        if (cancelledWhilePending) { // Escape, a hidden tab or Stop arrived while the prompt was open
          release();
          return;
        }
        mimeType = pickMimeType(MediaRecorderImpl);
        recorder = new MediaRecorderImpl(stream, mimeType ? { mimeType } : undefined);
      } catch (error) {
        release();
        throw error;
      } finally {
        pending = false;
      }
      chunks = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.start();
      timer = setTimeout(() => {
        onAutoStop?.();
        // Backstop: if nobody stopped the recording, release the mic anyway.
        timer = setTimeout(() => { if (recorder) cancelRecording(); }, 1500);
      }, maxSeconds * 1000);
    },

    /** Stops and returns the recording as a Blob (empty Blob if nothing was captured). */
    stop() {
      if (pending) cancelledWhilePending = true;
      if (!recorder) return Promise.resolve(new Blob([], { type: mimeType }));
      const active = recorder;
      return new Promise((resolve) => {
        active.onstop = () => {
          const type = (active.mimeType || mimeType || 'audio/webm').split(';')[0];
          const blob = new Blob(chunks, { type });
          release();
          resolve(blob);
        };
        if (active.state === 'inactive') active.onstop();
        else active.stop();
      });
    },

    /** Drops the recording without returning it. */
    cancel() {
      if (pending) cancelledWhilePending = true;
      cancelRecording();
    },
  };
}
