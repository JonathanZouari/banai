import { describe, expect, it, vi } from 'vitest';
import {
  createRecorder, isRecordingSupported, MAX_AUDIO_BYTES, pickMimeType, RecorderError,
} from '../../../src/voice/recorder.js';

function fakeMedia({ deny = null, bytes = 2000, mimeType = 'audio/webm;codecs=opus' } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  class FakeRecorder {
    static isTypeSupported = (type) => type === 'audio/webm;codecs=opus' || type === 'audio/webm';

    constructor(source, options) {
      this.source = source;
      this.options = options;
      this.state = 'inactive';
      this.mimeType = mimeType;
      this.handlers = {};
    }

    addEventListener(name, handler) { this.handlers[name] = handler; }

    start() { this.state = 'recording'; }

    stop() {
      this.state = 'inactive';
      this.handlers.dataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
      this.handlers.stop?.();
    }
  }
  const mediaDevices = {
    getUserMedia: vi.fn(async () => {
      if (deny) throw Object.assign(new Error('x'), { name: deny });
      return stream;
    }),
  };
  return { track, mediaDevices, MediaRecorderImpl: FakeRecorder };
}

describe('recorder', () => {
  it('records and returns a typed Blob, then releases the microphone', async () => {
    const media = fakeMedia();
    const recorder = createRecorder(media);
    await recorder.start();
    expect(recorder.isRecording()).toBe(true);
    const blob = await recorder.stop();
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBe(2000);
    expect(media.track.stop).toHaveBeenCalled();
    expect(recorder.isRecording()).toBe(false);
  });

  it('prefers a supported container and omits the option when none is known', () => {
    expect(pickMimeType({ isTypeSupported: (t) => t === 'audio/mp4' })).toBe('audio/mp4');
    expect(pickMimeType({ isTypeSupported: () => false })).toBe('');
    expect(pickMimeType(undefined)).toBe('');
  });

  it('reports unsupported browsers', async () => {
    expect(isRecordingSupported({ mediaDevices: undefined, MediaRecorderImpl: undefined })).toBe(false);
    const recorder = createRecorder({ mediaDevices: undefined, MediaRecorderImpl: undefined });
    await expect(recorder.start()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('maps permission and device errors to codes', async () => {
    await expect(createRecorder(fakeMedia({ deny: 'NotAllowedError' })).start()).rejects.toMatchObject({ code: 'denied' });
    await expect(createRecorder(fakeMedia({ deny: 'NotFoundError' })).start()).rejects.toMatchObject({ code: 'no-device' });
  });

  it('refuses a second start, an empty recording and one above the server cap', async () => {
    const recorder = createRecorder(fakeMedia());
    await recorder.start();
    await expect(recorder.start()).rejects.toBeInstanceOf(RecorderError);
    await recorder.stop();
    const empty = createRecorder(fakeMedia({ bytes: 0 }));
    await empty.start();
    await expect(empty.stop()).rejects.toMatchObject({ code: 'failed' });
    const big = createRecorder(fakeMedia({ bytes: MAX_AUDIO_BYTES + 1 }));
    await big.start();
    await expect(big.stop()).rejects.toMatchObject({ code: 'too-long' });
  });

  it('stops by itself after the maximum duration', async () => {
    const media = fakeMedia();
    let fire;
    const recorder = createRecorder({ ...media, maxMs: 30000, setTimer: (fn) => { fire = fn; return 1; }, clearTimer: () => {} });
    await recorder.start();
    fire();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(recorder.isRecording()).toBe(false);
    expect(media.track.stop).toHaveBeenCalled();
  });

  it('hands the pending recording to the limit handler instead of dropping it', async () => {
    const media = fakeMedia();
    let fire;
    const recorder = createRecorder({ ...media, setTimer: (fn) => { fire = fn; return 1; }, clearTimer: () => {} });
    const handler = vi.fn();
    recorder.onLimit(handler);
    await recorder.start();
    fire();
    const blob = await handler.mock.calls[0][0];
    expect(blob.size).toBe(2000);
    expect(recorder.isRecording()).toBe(false);
  });

  it('cancel releases the microphone and keeps nothing', async () => {
    const media = fakeMedia();
    const recorder = createRecorder(media);
    await recorder.start();
    recorder.cancel();
    expect(recorder.isRecording()).toBe(false);
    expect(media.track.stop).toHaveBeenCalled();
  });
});
