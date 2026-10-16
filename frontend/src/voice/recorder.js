// Microphone recorder (no DOM). Everything the browser provides is injected so it can be tested
// without a real microphone. One recording at a time; it stops by itself after `maxMs`.

export const MAX_RECORDING_MS = 30_000;
export const MAX_AUDIO_BYTES = 950_000; // the server refuses more than 1 MB

const PREFERRED_TYPES = Object.freeze(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']);

export class RecorderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RecorderError';
    this.code = code; // 'unsupported' | 'denied' | 'no-device' | 'too-long' | 'busy' | 'failed'
  }
}

export function pickMimeType(MediaRecorderImpl) {
  if (!MediaRecorderImpl || typeof MediaRecorderImpl.isTypeSupported !== 'function') return '';
  return PREFERRED_TYPES.find((type) => MediaRecorderImpl.isTypeSupported(type)) ?? '';
}

export function isRecordingSupported({ mediaDevices = globalThis.navigator?.mediaDevices, MediaRecorderImpl = globalThis.MediaRecorder } = {}) {
  return Boolean(mediaDevices?.getUserMedia && MediaRecorderImpl);
}

export function createRecorder({
  mediaDevices = globalThis.navigator?.mediaDevices,
  MediaRecorderImpl = globalThis.MediaRecorder,
  maxMs = MAX_RECORDING_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let session = null;
  let limitHandler = null;

  const release = () => {
    if (!session) return;
    clearTimer(session.timer);
    session.stream.getTracks().forEach((track) => track.stop());
    session = null;
  };

  return {
    isRecording: () => session !== null,

    /** `handler(pendingBlob)` runs when the time limit stops a recording. */
    onLimit(handler) { limitHandler = handler; },

    /** Ask for the microphone and start recording. Rejects with a RecorderError. */
    async start() {
      if (session) throw new RecorderError('busy', 'Already recording');
      if (!isRecordingSupported({ mediaDevices, MediaRecorderImpl })) throw new RecorderError('unsupported', 'Recording is not supported');
      let stream;
      try {
        stream = await mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
        throw new RecorderError(denied ? 'denied' : 'no-device', denied ? 'Microphone access was denied' : 'No microphone was found');
      }
      const mimeType = pickMimeType(MediaRecorderImpl);
      const recorder = new MediaRecorderImpl(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      const done = new Promise((resolve, reject) => {
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        });
        recorder.addEventListener('error', () => reject(new RecorderError('failed', 'Recording failed')));
        recorder.addEventListener('stop', () => {
          const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
          resolve(new Blob(chunks, { type }));
        });
      });
      // At the time limit the recording is finished for the caller, who receives the pending result.
      const atLimit = () => {
        const pending = this.stop();
        if (limitHandler) limitHandler(pending);
        else pending.catch(() => {});
      };
      session = { stream, recorder, done, timer: setTimer(atLimit, maxMs) };
      recorder.start();
    },

    /** Stop and return the recording as a Blob. Rejects when it is empty or too large. */
    async stop() {
      if (!session) throw new RecorderError('failed', 'Not recording');
      const { recorder, done } = session;
      if (recorder.state !== 'inactive') recorder.stop();
      try {
        const blob = await done;
        if (blob.size === 0) throw new RecorderError('failed', 'Nothing was recorded');
        if (blob.size > MAX_AUDIO_BYTES) throw new RecorderError('too-long', 'The recording is too long');
        return blob;
      } finally {
        release();
      }
    },

    /** Stop without keeping anything. */
    cancel() {
      if (!session) return;
      const { recorder } = session;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* already stopped */ }
      }
      release();
    },
  };
}
